import { json, errorJson } from "../core/http.js";
import { requireAdmin } from "./auth.js";
import { emergencyAdminRead } from "../emergency/d1-admin-view.js";

const SOURCES = new Set(["d1", "do"]);
const D1_ROOM_WRITE_RE = /^\/admin\/api\/(?:room\/|rooms\/(?:batch|announcement)$)/;

export function adminDataSourceFromRequest(request) {
  const url = new URL(request.url);
  const raw = String(url.searchParams.get("source") || "").toLowerCase();
  return SOURCES.has(raw) ? raw : null;
}

export function adminDataSourceAvailability(env) {
  return {
    d1: !!env?.BOARDVERSE_D1,
    do: !!env?.BOARDVERSE_DB_DO,
  };
}

export function adminDataSourceDefault(env) {
  const until = Date.parse(String(env?.BOARDVERSE_EMERGENCY_UNTIL || ""));
  const emergency = !!env?.BOARDVERSE_D1 && String(env?.BOARDVERSE_EMERGENCY_D1 || "") === "1" && (!Number.isFinite(until) || Date.now() < until);
  return emergency ? "d1" : "do";
}

export function adminDataSourceEnv(env, source) {
  const selected = source === "d1" ? "d1" : "do";
  return new Proxy(env || {}, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (key === "BOARDVERSE_EMERGENCY_D1") return "0";
      if (key === "BOARDVERSE_DB") return selected === "d1" ? target.BOARDVERSE_D1 : undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      const key = String(prop);
      if (key === "BOARDVERSE_DB") return selected === "d1" ? !!target.BOARDVERSE_D1 : false;
      return Reflect.has(target, prop);
    },
  });
}

export async function adminDataSourceRoute(request, env, ctx, delegate) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin/api/")) return null;
  if (url.pathname === "/admin/api/data-source" && request.method === "GET") {
    try {
      await requireAdmin(env, request);
      return json({ ok: true, data: { available: adminDataSourceAvailability(env), defaultSource: adminDataSourceDefault(env) } });
    } catch (error) {
      return errorJson(error?.message || "請先登入管理後台。", Number(error?.status || 401), error?.code || "admin_required");
    }
  }
  const source = adminDataSourceFromRequest(request);
  if (!source) return null;
  const available = adminDataSourceAvailability(env);
  if (!available[source]) return errorJson(source === "d1" ? "D1 資料來源目前不可用。" : "Durable Object 資料來源目前不可用。", 503, "admin_data_source_unavailable");
  if (source === "d1" && request.method !== "GET" && D1_ROOM_WRITE_RE.test(url.pathname)) {
    return errorJson("D1 房間檢視為唯讀；請切換到 DO 後再執行房間控制。", 409, "admin_d1_room_read_only");
  }
  if (source === "d1" && request.method === "GET" && (url.pathname === "/admin/api/summary" || url.pathname === "/admin/api/rooms")) {
    return emergencyAdminRead(request, env);
  }
  return delegate(request, adminDataSourceEnv(env, source), ctx);
}
