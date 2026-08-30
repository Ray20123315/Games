import appV022, { GameRoom as GameRoomV022 } from "./index-v022.js";
import { injectUrgentV023 } from "./ui/urgent-v023.js";
import { injectAuthenticatedRoomFields } from "./ui/authenticated-room-fields.js";
import { withDatabaseEnv } from "./core/db.js";
import { sessionUser } from "./auth/sessions.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { ensureFeatureState } from "./room/state.js";
import { errorJson, json } from "./core/http.js";

export * from "./index-v022.js";

const ROOM_CREATE_RE = /^\/api\/rooms$/;
const ROOM_ENTER_RE = /^\/api\/rooms\/([A-Z2-9]{6})\/(?:enter|join)$/;

function emergencyEnabled(env) {
  if (!env?.BOARDVERSE_D1 || String(env.BOARDVERSE_EMERGENCY_D1 || "") !== "1") return false;
  const until = Date.parse(String(env.BOARDVERSE_EMERGENCY_UNTIL || ""));
  return !Number.isFinite(until) || Date.now() < until;
}

function emergencyAccountEnv(env) {
  return new Proxy(env || {}, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (key === "BOARDVERSE_DB") return target.BOARDVERSE_D1;
      if (key === "BOARDVERSE_DB_DO") return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      const key = String(prop);
      if (key === "BOARDVERSE_DB") return !!target.BOARDVERSE_D1;
      if (key === "BOARDVERSE_DB_DO") return false;
      return Reflect.has(target, prop);
    },
  });
}

async function authenticatedRoomIdentity(env, request) {
  const effectiveEnv = emergencyEnabled(env) ? emergencyAccountEnv(env) : withDatabaseEnv(env);
  const db = effectiveEnv?.BOARDVERSE_DB || null;
  if (db) {
    try {
      const user = await sessionUser(db, request);
      if (user?.id) {
        const name = String(user.username_display || user.username || "").normalize("NFKC").trim().slice(0, 40);
        if (name) return { userId: String(user.id), name };
      }
    } catch {}
  }
  try {
    const admin = await adminPlayerEntitlement(effectiveEnv, request);
    if (admin?.user) {
      const name = String(admin.user).normalize("NFKC").trim().slice(0, 40);
      if (name) return { userId: `admin:${String(admin.user)}`, name };
    }
  } catch {}
  return null;
}

function memberForUser(room, userId) {
  const bv = room?.bv || {};
  const members = Array.isArray(room?.members) ? room.members : [];
  return members.find((member) => {
    const attached = member?.userId || bv.memberUsers?.[member?.id] || null;
    return attached != null && String(attached) === String(userId);
  }) || null;
}

async function resolveAuthenticatedRoomSession(env, roomId, userId) {
  if (!roomId || !userId) return null;
  if (emergencyEnabled(env)) {
    try {
      const row = await env.BOARDVERSE_D1.prepare("SELECT room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?")
        .bind(roomId, Date.now()).first();
      if (!row?.room_json) return null;
      const member = memberForUser(JSON.parse(row.room_json), userId);
      return member?.token ? { token: String(member.token), name: String(member.name || "") } : null;
    } catch { return null; }
  }
  try {
    const namespace = env?.ROOMS;
    const stub = namespace?.getByName ? namespace.getByName(roomId)
      : namespace?.idFromName && namespace?.get ? namespace.get(namespace.idFromName(roomId)) : null;
    if (!stub) return null;
    const response = await stub.fetch(new Request("https://boardverse.internal/feature/authenticated-room-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: String(userId) }),
    }));
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data?.token ? { token: String(data.token), name: String(data.name || "") } : null;
  } catch { return null; }
}

async function prepareAuthenticatedRoomRequest(request, env) {
  if (request.method !== "POST") return request;
  const url = new URL(request.url), enter = url.pathname.match(ROOM_ENTER_RE);
  if (!ROOM_CREATE_RE.test(url.pathname) && !enter) return request;
  const identity = await authenticatedRoomIdentity(env, request);
  if (!identity) return request;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return request;

  body.playerName = identity.name;
  body.returnPassword = "";
  if (enter) {
    const existing = await resolveAuthenticatedRoomSession(env, enter[1], identity.userId);
    if (existing?.token) {
      body.sessionToken = existing.token;
      if (existing.name) body.playerName = existing.name;
    }
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Request(request, { headers, body: JSON.stringify(body) });
}

export class GameRoom extends GameRoomV022 {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/feature/authenticated-room-session" && request.method === "POST") {
      const room = await this.loadRoom();
      if (!room) return errorJson("找不到此房間。", 404, "room_not_found");
      const body = await request.json().catch(() => ({}));
      const userId = String(body.userId || "");
      if (!userId) return errorJson("缺少登入身份。", 400, "user_required");
      ensureFeatureState(room);
      const member = memberForUser(room, userId);
      if (!member?.token) return errorJson("此登入帳號尚未綁定這個房間身份。", 404, "room_identity_not_found");
      return json({ ok: true, token: String(member.token), name: String(member.name || "") });
    }
    return super.fetch(request);
  }
}

async function improve(response) {
  const type = String(response?.headers?.get("content-type") || "");
  if (!type.includes("text/html")) return response;
  let body = injectUrgentV023(await response.text());
  body = injectAuthenticatedRoomFields(body);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-ui-hotfix", "v023");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const prepared = await prepareAuthenticatedRoomRequest(request, env);
    return improve(await appV022.fetch(prepared, env, ctx));
  },
  scheduled(event, env, ctx) { return appV022.scheduled(event, env, ctx); },
};
