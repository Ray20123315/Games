import { GameRoom as CurrentGameRoom } from "../index-v017.js";

const ROOM_TTL_MS = 30 * 60 * 60 * 1000;
const POLL_MS = 850;
const POLL_LOOPS = 14;
const ROOM_CODE_RE = /^[A-Z2-9]{6}$/;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MUTATING_TYPES = new Set([
  "move","pass","swap_sides","resign","ready","undo_request","undo_accept","undo_reject",
  "rematch","rematch_request","rematch_accept","review_join","queue_move","queue_settings",
  "room_chat_settings","chat","host_kick","qiguo_choose","opening_guess","opening_choose","opening_hand",
]);

let schemaPromise = null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function cleanName(value, fallback = "Guest") {
  const out = String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return out || fallback;
}

function randomRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const b of bytes) out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  return out;
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
  const engine = Object.create(CurrentGameRoom.prototype);
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

function roomColumns(room) {
  return {
    name: String(room?.name || room?.id || "BoardVerse"),
    gameId: String(room?.gameId || "gomoku"),
    status: String(room?.status || "waiting"),
    privateRoom: room?.privateRoom ? 1 : 0,
    players: Array.isArray(room?.seats) ? room.seats.filter(Boolean).length : 0,
    queueEnabled: room?.settings?.queueEnabled ? 1 : 0,
    queueLength: Array.isArray(room?.queue) ? room.queue.length : 0,
    createdAt: Number(room?.createdAt || Date.now()),
    updatedAt: Number(room?.updatedAt || Date.now()),
    startedAt: room?.startedAt == null ? null : Number(room.startedAt),
    endedAt: room?.endedAt == null ? null : Number(room.endedAt),
  };
}

export async function ensureEmergencySchema(db) {
  if (!db) throw new Error("BOARDVERSE_D1 binding is unavailable");
  if (!schemaPromise) {
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS emergency_rooms (
        room_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL DEFAULT 1,
        room_json TEXT NOT NULL,
        room_name TEXT NOT NULL,
        game_id TEXT NOT NULL,
        status TEXT NOT NULL,
        private_room INTEGER NOT NULL DEFAULT 0,
        players INTEGER NOT NULL DEFAULT 0,
        queue_enabled INTEGER NOT NULL DEFAULT 0,
        queue_length INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        expires_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_emergency_rooms_public ON emergency_rooms(private_room,status,updated_at DESC)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_emergency_rooms_expiry ON emergency_rooms(expires_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS emergency_global_chat (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        sender_key TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_emergency_global_chat_created ON emergency_global_chat(created_at DESC)"),
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

async function loadRoom(db, roomId) {
  const row = await db.prepare("SELECT revision,room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?")
    .bind(String(roomId), Date.now()).first();
  if (!row) return null;
  try { return { revision: Number(row.revision || 0), room: JSON.parse(row.room_json) }; }
  catch { return null; }
}

async function insertRoom(db, room) {
  const c = roomColumns(room), now = Date.now();
  const result = await db.prepare(`INSERT OR IGNORE INTO emergency_rooms(
    room_id,revision,room_json,room_name,game_id,status,private_room,players,queue_enabled,queue_length,
    created_at,updated_at,started_at,ended_at,expires_at
  ) VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      room.id, JSON.stringify(room), c.name, c.gameId, c.status, c.privateRoom, c.players, c.queueEnabled, c.queueLength,
      c.createdAt, c.updatedAt, c.startedAt, c.endedAt, now + ROOM_TTL_MS,
    ).run();
  return Number(result?.meta?.changes || result?.changes || 0) > 0;
}

async function updateRoom(db, roomId, expectedRevision, room) {
  room.updatedAt = Date.now();
  const c = roomColumns(room), now = Date.now();
  const result = await db.prepare(`UPDATE emergency_rooms SET
    revision=revision+1,room_json=?,room_name=?,game_id=?,status=?,private_room=?,players=?,queue_enabled=?,queue_length=?,
    updated_at=?,started_at=?,ended_at=?,expires_at=? WHERE room_id=? AND revision=?`)
    .bind(
      JSON.stringify(room), c.name, c.gameId, c.status, c.privateRoom, c.players, c.queueEnabled, c.queueLength,
      c.updatedAt, c.startedAt, c.endedAt, now + ROOM_TTL_MS, String(roomId), Number(expectedRevision),
    ).run();
  return Number(result?.meta?.changes || result?.changes || 0) > 0;
}

function stateMessages(room, token) {
  const engine = engineFor(room), messages = [], ws = captureSocket(token, messages);
  try { engine.sendState(ws); }
  catch (error) { messages.push({ type: "error", message: error?.message || String(error) }); }
  return messages;
}

export async function listEmergencyRooms(db) {
  await ensureEmergencySchema(db);
  const result = await db.prepare(`SELECT room_id,room_name,game_id,status,players,queue_enabled,queue_length,created_at,updated_at,started_at,ended_at
    FROM emergency_rooms WHERE private_room=0 AND expires_at>? AND status IN ('waiting','playing') ORDER BY updated_at DESC LIMIT 100`)
    .bind(Date.now()).all();
  const rooms = (result?.results || []).map((r) => ({
    id: r.room_id, name: r.room_name, gameId: r.game_id, status: r.status, players: Number(r.players || 0),
    queueEnabled: !!r.queue_enabled, queueLength: Number(r.queue_length || 0), createdAt: Number(r.created_at || 0),
    updatedAt: Number(r.updated_at || 0), startedAt: r.started_at == null ? null : Number(r.started_at), endedAt: r.ended_at == null ? null : Number(r.ended_at),
  }));
  return json({ ok: true, rooms, emergency: true });
}

export async function createEmergencyRoom(db, request) {
  await ensureEmergencySchema(db);
  const body = await request.json().catch(() => ({}));
  const desired = String(body.customRoomCode || body.feature?.customRoomCode || "").toUpperCase().trim();
  if (desired && !ROOM_CODE_RE.test(desired)) return json({ ok: false, code: "room_code_invalid", message: "房號必須是 6 碼英數字。" }, 400);

  for (let attempt = 0; attempt < 8; attempt++) {
    const roomId = desired || randomRoomCode();
    if (await loadRoom(db, roomId)) {
      if (desired) return json({ ok: false, code: "room_exists", message: "這個房號目前已被使用。" }, 409);
      continue;
    }
    const engine = engineFor(null);
    const target = new Request("https://boardverse.internal/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId,
        roomName: body.roomName,
        playerName: cleanName(body.playerName),
        gameId: body.gameId,
        isPrivate: !!body.privateRoom,
        rules: body.rules || {},
        returnPassword: String(body.returnPassword || ""),
        settings: body.settings || {},
        feature: { ...(body.feature || {}), roomCodeType: desired ? "custom" : "random", ownerUserId: null },
      }),
    });
    const response = await engine.initRoom(target);
    const data = await response.clone().json().catch(() => ({ ok: false, message: "建立房間失敗。" }));
    if (!response.ok || !engine.room) return json(data, response.status);
    if (!(await insertRoom(db, engine.room))) {
      if (desired) return json({ ok: false, code: "room_exists", message: "這個房號目前已被使用。" }, 409);
      continue;
    }
    return json({ ...data, emergency: true }, 201);
  }
  return json({ ok: false, code: "room_create_busy", message: "暫時無法配置房號，請再試一次。" }, 503);
}

export async function emergencyRoomInfo(db, roomId) {
  await ensureEmergencySchema(db);
  const current = await loadRoom(db, roomId);
  if (!current) return json({ ok: false, code: "room_not_found", message: "找不到此房間。" }, 404);
  const engine = engineFor(current.room);
  const response = await engine.roomInfo();
  const data = await response.clone().json().catch(() => ({ ok: false, message: "房間資料讀取失敗。" }));
  return json({ ...data, emergency: true }, response.status);
}

export async function enterEmergencyRoom(db, roomId, request) {
  await ensureEmergencySchema(db);
  const input = await request.json().catch(() => ({}));
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await loadRoom(db, roomId);
    if (!current) return json({ ok: false, code: "room_not_found", message: "找不到此房間。" }, 404);
    const engine = engineFor(current.room);
    const target = new Request("https://boardverse.internal/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerName: cleanName(input.playerName),
        returnPassword: String(input.returnPassword || ""),
        role: input.role === "spectator" ? "spectator" : "player",
        sessionToken: String(input.sessionToken || ""),
      }),
    });
    const response = await engine.enterRoom(target);
    const data = await response.clone().json().catch(() => ({ ok: false, message: "進入房間失敗。" }));
    if (!response.ok) return json(data, response.status);
    if (await updateRoom(db, roomId, current.revision, engine.room)) return json({ ...data, emergency: true }, response.status);
  }
  return json({ ok: false, code: "state_changed", message: "房間剛剛有變動，請再按一次。" }, 409);
}

export async function pollEmergencyRoom(db, roomId, requestUrl) {
  await ensureEmergencySchema(db);
  const url = new URL(requestUrl), token = url.searchParams.get("token") || "";
  const since = Number(url.searchParams.get("since") ?? -1);
  for (let i = 0; i < POLL_LOOPS; i++) {
    const current = await loadRoom(db, roomId);
    if (!current) return json({ ok: false, code: "room_not_found", message: "房間已不存在。" }, 404);
    if (!Number.isFinite(since) || current.revision !== since) {
      return json({ ok: true, revision: current.revision, messages: stateMessages(current.room, token), emergency: true });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return json({ ok: true, revision: since, messages: [], emergency: true });
}

export async function actionEmergencyRoom(db, roomId, request) {
  await ensureEmergencySchema(db);
  const body = await request.json().catch(() => ({})), token = String(body.token || ""), message = body.message;
  if (!message || typeof message !== "object") return json({ ok: false, code: "bad_message", message: "訊息格式錯誤。" }, 400);
  if (message.type === "voice_signal") return json({ ok: false, code: "emergency_voice_unavailable", message: "緊急 D1 模式暫不提供語音，文字聊天與棋局仍可使用。" }, 409);

  const current = await loadRoom(db, roomId);
  if (!current) return json({ ok: false, code: "room_not_found", message: "房間已不存在。" }, 404);
  const engine = engineFor(current.room), messages = [], ws = captureSocket(token, messages);
  await engine.webSocketMessage(ws, JSON.stringify(message));
  const error = messages.find((m) => m?.type === "error");
  if (error) return json({ ok: false, code: "room_action_failed", message: error.message || "操作失敗。", messages }, 400);

  const mutates = MUTATING_TYPES.has(String(message.type || ""));
  if (mutates) {
    if (!(await updateRoom(db, roomId, current.revision, engine.room))) {
      return json({ ok: false, code: "state_changed", message: "另一位玩家剛完成操作，棋盤已重新同步。" }, 409);
    }
  }
  try { engine.sendState(ws); } catch {}
  return json({ ok: true, revision: current.revision + (mutates ? 1 : 0), messages, emergency: true });
}

export async function emergencyGlobalIdentity(db) {
  await ensureEmergencySchema(db);
  const token = `e-${crypto.randomUUID()}`;
  return json({ ok: true, identity: token, emergency: true });
}

function emergencyGuestName(identity) {
  const suffix = String(identity || "").replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "guest";
  return `訪客 · Guest-${suffix}`;
}

export async function postEmergencyGlobal(db, request) {
  await ensureEmergencySchema(db);
  const body = await request.json().catch(() => ({}));
  const identity = String(body.identity || ""), text = String(body.text || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 300);
  if (!identity.startsWith("e-") || !text) return json({ ok: false, code: "bad_chat", message: "聊天訊息無效。" }, 400);
  const id = crypto.randomUUID(), at = Date.now(), name = emergencyGuestName(identity);
  const result = await db.prepare("INSERT INTO emergency_global_chat(id,sender_key,sender_name,message_text,created_at) VALUES(?,?,?,?,?)")
    .bind(id, identity, name, text, at).run();
  let seq = Number(result?.meta?.last_row_id || 0);
  if (!seq) seq = Number((await db.prepare("SELECT seq FROM emergency_global_chat WHERE id=?").bind(id).first())?.seq || 0);
  return json({ ok: true, message: { id, name, text, at, seq }, emergency: true });
}

export async function pollEmergencyGlobal(db, requestUrl) {
  await ensureEmergencySchema(db);
  const url = new URL(requestUrl), since = Math.max(0, Number(url.searchParams.get("since") || 0)), initial = url.searchParams.get("initial") === "1";
  if (initial) {
    const result = await db.prepare("SELECT seq,id,sender_name,message_text,created_at FROM emergency_global_chat ORDER BY seq DESC LIMIT 100").all();
    const rows = (result?.results || []).slice().reverse();
    return json({ ok: true, initial: true, lastSeq: Number(rows.at(-1)?.seq || 0), messages: rows.map((r) => ({ id:r.id,name:r.sender_name,text:r.message_text,at:Number(r.created_at),seq:Number(r.seq) })) });
  }
  for (let i = 0; i < POLL_LOOPS; i++) {
    const result = await db.prepare("SELECT seq,id,sender_name,message_text,created_at FROM emergency_global_chat WHERE seq>? ORDER BY seq ASC LIMIT 100").bind(since).all();
    const rows = result?.results || [];
    if (rows.length) return json({ ok: true, lastSeq: Number(rows.at(-1)?.seq || since), messages: rows.map((r) => ({ id:r.id,name:r.sender_name,text:r.message_text,at:Number(r.created_at),seq:Number(r.seq) })) });
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return json({ ok: true, lastSeq: since, messages: [] });
}

export async function cleanupEmergencyD1(db) {
  if (!db) return;
  await ensureEmergencySchema(db);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM emergency_rooms WHERE expires_at<=?").bind(now),
    db.prepare("DELETE FROM emergency_global_chat WHERE created_at<?").bind(now - 24 * 60 * 60 * 1000),
  ]);
}
