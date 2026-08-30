import appV021, { GameRoom as GameRoomV021 } from "./index-v021.js";
import { injectRoomWorkspace } from "./ui/room-workspace-ui.js";
import { applyRoomSettings, emergencyRoomSettings, roomSettingsSnapshot } from "./room/settings-workspace.js";
import { errorJson, json } from "./core/http.js";

export * from "./index-v021.js";

const SETTINGS_RE = /^\/api\/rooms\/([A-Z2-9]{6})\/settings$/;

function emergencyEnabled(env) {
  if (!env?.BOARDVERSE_D1 || String(env.BOARDVERSE_EMERGENCY_D1 || "") !== "1") return false;
  const until = Date.parse(String(env.BOARDVERSE_EMERGENCY_UNTIL || ""));
  return !Number.isFinite(until) || Date.now() < until;
}
function roomStub(namespace, roomId) {
  if (!namespace) return null;
  if (typeof namespace.getByName === "function") return namespace.getByName(roomId);
  if (typeof namespace.idFromName === "function" && typeof namespace.get === "function") return namespace.get(namespace.idFromName(roomId));
  return null;
}
async function injectHtml(response) {
  const type = String(response?.headers?.get("content-type") || "");
  if (!type.includes("text/html")) return response;
  const body = injectRoomWorkspace(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-room-workspace", "v1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
async function publicSettingsEndpoint(request, env, roomId) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") || "");
  if (!token) return errorJson("房間工作階段已失效。", 401, "session_invalid");
  let input = null;
  if (request.method === "POST") input = await request.json().catch(() => ({}));
  if (emergencyEnabled(env)) {
    const result = await emergencyRoomSettings(env.BOARDVERSE_D1, roomId, token, input);
    return result.ok ? json(result) : errorJson(result.message, result.status || 400, result.code || "settings_failed");
  }
  const stub = roomStub(env?.ROOMS, roomId);
  if (!stub) return errorJson("房間服務暫時不可用。", 503, "room_binding_missing");
  const internalUrl = new URL("https://boardverse.internal/feature/room-settings");
  if (request.method === "GET") internalUrl.searchParams.set("token", token);
  return stub.fetch(new Request(internalUrl, {
    method: request.method,
    headers: { "content-type": "application/json" },
    body: request.method === "POST" ? JSON.stringify({ token, input }) : undefined,
  }));
}

export class GameRoom extends GameRoomV021 {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/feature/room-settings" && (request.method === "GET" || request.method === "POST")) {
      await this.loadRoom();
      if (!this.room) return errorJson("找不到此房間。", 404, "room_not_found");
      if (request.method === "GET") {
        const settings = roomSettingsSnapshot(this.room, String(url.searchParams.get("token") || ""));
        return settings ? json({ ok: true, settings }) : errorJson("只有房主可以修改房間設定。", 403, "owner_required");
      }
      const body = await request.json().catch(() => ({}));
      try {
        const settings = applyRoomSettings(this.room, String(body.token || ""), body.input || {});
        await this.saveRoom();
        await this.syncLobby();
        await this.broadcastState();
        return json({ ok: true, settings });
      } catch (error) {
        return errorJson(error?.message || "房間設定更新失敗。", error?.code === "owner_required" ? 403 : 400, error?.code || "settings_failed");
      }
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(SETTINGS_RE);
    if (match && (request.method === "GET" || request.method === "POST")) return publicSettingsEndpoint(request, env, match[1]);
    return injectHtml(await appV021.fetch(request, env, ctx));
  },
  scheduled(event, env, ctx) { return appV021.scheduled(event, env, ctx); },
};
