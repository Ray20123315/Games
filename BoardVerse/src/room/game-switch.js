import { GameRoom as CurrentGameRoom } from "../index-v017.js";
import { GAME_IDS } from "../core/config.js";
import { ensureFeatureState, resetReady } from "./state.js";

function error(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
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

function blankEngine() {
  const engine = Object.create(CurrentGameRoom.prototype);
  engine.room = null;
  engine.env = {};
  engine.ctx = fakeContext();
  engine.loadRoom = async () => engine.room;
  engine.saveRoom = async () => {};
  engine.syncLobby = async () => {};
  engine.broadcastState = async () => {};
  engine.updateOfflineAlarm = async () => {};
  return engine;
}

function sideFor(gameId, seat) {
  if (gameId === "qiguo") return null;
  if (gameId === "chess") return seat === 0 ? "W" : "B";
  if (["xiangqi", "xiangqi_random", "banqi"].includes(gameId)) return seat === 0 ? "R" : "B";
  return seat === 0 ? "B" : "W";
}

function memberById(room, id) {
  return (room?.members || []).find((m) => String(m?.id || "") === String(id || "")) || null;
}

export async function switchRoomGame(room, targetGameId, { voiceAvailable = true } = {}) {
  const gameId = String(targetGameId || "");
  if (!GAME_IDS.includes(gameId)) throw error("不支援這個棋類。", "unknown_game");
  if (gameId === String(room?.gameId || "")) return false;
  if (room?.status === "playing") {
    throw error("對局進行中不可切換棋類；本局結束後可直接在原房切換。", "settings_locked_during_match");
  }

  const owner = memberById(room, room.ownerId) || (room.members || []).find((m) => m?.isOwner);
  if (!owner) throw error("房主資料不完整，暫時無法切換棋類。", "owner_missing");

  const oldBv = structuredClone(ensureFeatureState(room));
  const engine = blankEngine();
  const target = new Request("https://boardverse.internal/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomId: room.id,
      roomName: room.name,
      playerName: owner.name,
      gameId,
      isPrivate: !!room.privateRoom,
      rules: {},
      returnPassword: "",
      settings: room.settings || {},
    }),
  });
  const response = await engine.initRoom(target);
  if (!response.ok || !engine.room) {
    const data = await response.clone().json().catch(() => null);
    throw error(data?.message || "新棋類初始化失敗，請稍後再試。", data?.error || "game_switch_failed");
  }
  const fresh = engine.room;

  const oldSeated = (room.seats || []).filter(Boolean);
  const capacity = Math.max(2, fresh.seats?.length || 2);
  const kept = oldSeated.slice(0, capacity);
  if (!kept.includes(owner.id)) {
    const ownerIndex = oldSeated.indexOf(owner.id);
    if (ownerIndex >= 0) kept.splice(Math.min(kept.length, capacity - 1), 0, owner.id);
    else kept.unshift(owner.id);
  }
  const uniqueKept = [...new Set(kept)].slice(0, capacity);
  room.seats = [...uniqueKept, ...Array(Math.max(0, capacity - uniqueKept.length)).fill(null)];

  for (const member of room.members || []) {
    const seatIndex = room.seats.indexOf(member.id);
    member.countries = [];
    if (seatIndex >= 0) {
      member.role = "player";
      member.side = sideFor(gameId, seatIndex);
    } else if (["player", "pending", "queued"].includes(member.role)) {
      member.role = "spectator";
      member.side = null;
    }
    member.offlineSince = null;
    member.offlineDeadline = null;
    member.offlineMatchSeq = null;
    member.updatedAt = Date.now();
  }

  room.gameId = gameId;
  room.rules = structuredClone(fresh.rules || {});
  room.game = structuredClone(fresh.game);
  room.status = "waiting";
  room.startedAt = null;
  room.endedAt = null;
  room.opening = null;
  room.result = null;
  room.currentReplay = null;
  room.pending = [];
  room.queue = [];
  room.rematchVotes = [];

  const bv = ensureFeatureState(room);
  const preserved = {
    memberUsers: oldBv.memberUsers || {},
    clockConfig: oldBv.clockConfig || { mode: "untimed" },
    playerChatSlowMs: Number(oldBv.playerChatSlowMs || 0),
    spectatorChatSlowMs: Number(oldBv.spectatorChatSlowMs || 0),
    roomCodeType: oldBv.roomCodeType || "random",
    ownerUserId: oldBv.ownerUserId || null,
    ownerGraceMs: oldBv.ownerGraceMs ?? null,
    focusGuardConfig: oldBv.focusGuardConfig || null,
  };
  Object.assign(bv, preserved);
  bv.gameInstanceId = crypto.randomUUID();
  bv.pendingUndo = null;
  bv.pendingRematch = null;
  bv.lastUndoSnapshot = null;
  bv.clock = null;
  bv.deadlines = {};
  bv.voiceEnabled = gameId === "qiguo" || !voiceAvailable ? false : !!oldBv.voiceEnabled;
  bv.focusGuardMatchId = null;
  bv.focusGuardViolations = {};
  bv.focusGuardLastEvent = {};
  bv.revision = Number(oldBv.revision || 0) + 1;
  bv.updatedAt = Date.now();
  resetReady(room, false);
  room.updatedAt = Date.now();
  return true;
}
