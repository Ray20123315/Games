import { FocusGuardGameRoom } from "../room/focus-guard-room.js";
import { ensureEmergencySchema } from "./d1-mode.js";

const POLL_MS = 2000;
const POLL_LOOPS = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fakeContext() {
  const storage = {
    async get() { return undefined; },
    async put() {},
    async delete() {},
    async getAlarm() { return null; },
    async setAlarm() {},
    async deleteAlarm() {},
  };
  return {
    storage,
    getWebSockets() { return []; },
    acceptWebSocket() {},
    setWebSocketAutoResponse() {},
    waitUntil(promise) { Promise.resolve(promise).catch(() => {}); },
  };
}

function engineFor(room) {
  const engine = Object.create(FocusGuardGameRoom.prototype);
  engine.room = room ? structuredClone(room) : null;
  engine.env = {};
  engine.ctx = fakeContext();
  engine.loadRoom = async () => engine.room;
  engine.saveRoom = async () => {};
  engine.syncLobby = async () => {};
  engine.broadcastState = async () => {};
  engine.updateOfflineAlarm = async () => {};
  return engine;
}

function captureSocket(token, messages) {
  return {
    deserializeAttachment() { return { token: String(token || "") }; },
    serializeAttachment() {},
    send(raw) {
      try { messages.push(JSON.parse(String(raw))); }
      catch { messages.push({ type: "error", message: String(raw) }); }
    },
    close() {},
  };
}

async function loadRoom(db, roomId) {
  const row = await db.prepare("SELECT revision,room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?")
    .bind(String(roomId), Date.now()).first();
  if (!row) return null;
  try { return { revision: Number(row.revision || 0), room: JSON.parse(row.room_json) }; }
  catch { return null; }
}

function roomColumns(room) {
  return {
    name: String(room?.name || room?.id || "BoardVerse"),
    gameId: String(room?.gameId || "gomoku"),
    status: String(room?.status || "waiting"),
    privateRoom: room?.privateRoom ? 1 : 0,
    players: Array.isArray(room?.seats) ? room.seats.filter(Boolean).length : 0,
    queueEnabled: room?.settings?.queueEnabled ? 1 : 0,
    queueLength: Array.isArray(room?.queue) ? room.queue.length : 0,
    updatedAt: Number(room?.updatedAt || Date.now()),
    startedAt: room?.startedAt == null ? null : Number(room.startedAt),
    endedAt: room?.endedAt == null ? null : Number(room.endedAt),
  };
}

async function updateRoom(db, roomId, expectedRevision, room) {
  room.updatedAt = Date.now();
  const c = roomColumns(room), now = Date.now();
  const result = await db.prepare(`UPDATE emergency_rooms SET
    revision=revision+1,room_json=?,room_name=?,game_id=?,status=?,private_room=?,players=?,queue_enabled=?,queue_length=?,
    updated_at=?,started_at=?,ended_at=?,expires_at=? WHERE room_id=? AND revision=?`)
    .bind(
      JSON.stringify(room), c.name, c.gameId, c.status, c.privateRoom, c.players, c.queueEnabled, c.queueLength,
      c.updatedAt, c.startedAt, c.endedAt, now + 30 * 60 * 60 * 1000, String(roomId), Number(expectedRevision),
    ).run();
  return Number(result?.meta?.changes || result?.changes || 0) > 0;
}

function stateMessages(room, token) {
  const engine = engineFor(room), messages = [], ws = captureSocket(token, messages);
  try { engine.sendState(ws); }
  catch (error) { messages.push({ type: "error", message: error?.message || String(error) }); }
  return messages;
}

export async function pollEmergencyRoomLean(db, roomId, requestUrl) {
  await ensureEmergencySchema(db);
  const url = new URL(requestUrl), token = url.searchParams.get("token") || "";
  const since = Number(url.searchParams.get("since") ?? -1);
  for (let i = 0; i < POLL_LOOPS; i++) {
    const current = await loadRoom(db, roomId);
    if (!current) return json({ ok: false, code: "room_not_found", message: "房間已不存在。" }, 404);
    if (!Number.isFinite(since) || current.revision !== since) {
      return json({ ok: true, revision: current.revision, messages: stateMessages(current.room, token), emergency: true, pollMs: POLL_MS });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return json({ ok: true, revision: since, messages: [], emergency: true, pollMs: POLL_MS });
}

export async function actionEmergencyFocus(db, roomId, request) {
  await ensureEmergencySchema(db);
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || ""), message = body.message;
  if (!message || !["focus_guard_settings", "focus_violation"].includes(String(message.type || ""))) {
    return json({ ok: false, code: "bad_focus_message", message: "防切頁訊息格式錯誤。" }, 400);
  }
  const current = await loadRoom(db, roomId);
  if (!current) return json({ ok: false, code: "room_not_found", message: "房間已不存在。" }, 404);
  const engine = engineFor(current.room), messages = [], ws = captureSocket(token, messages);
  await engine.webSocketMessage(ws, JSON.stringify(message));
  const error = messages.find((item) => item?.type === "error");
  if (error) return json({ ok: false, code: error.code || "focus_guard_failed", message: error.message || "防切頁操作失敗。", messages }, 400);
  if (!(await updateRoom(db, roomId, current.revision, engine.room))) {
    return json({ ok: false, code: "state_changed", message: "房間剛剛有變動，已重新同步。" }, 409);
  }
  try { engine.sendState(ws); } catch {}
  return json({ ok: true, revision: current.revision + 1, messages, emergency: true });
}
