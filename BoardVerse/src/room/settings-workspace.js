import { ensureFeatureState, resetReady } from "./state.js";
import { normalizeClockConfig } from "../clock/clock-engine.js";

const ROTATIONS = new Set(["winner_stays", "rotate_both", "host_stays"]);

function cleanText(value, fallback = "", max = 40) {
  const out = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return out || fallback;
}
function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function sameTypeRule(current, incoming) {
  if (typeof current === "boolean") return !!incoming;
  if (typeof current === "number") {
    const n = Number(incoming);
    return Number.isFinite(n) ? n : current;
  }
  if (typeof current === "string") return cleanText(incoming, current, 80);
  return current;
}
function sanitizeRules(current, incoming) {
  const out = { ...(current || {}) };
  if (!incoming || typeof incoming !== "object") return out;
  for (const key of Object.keys(out)) if (Object.prototype.hasOwnProperty.call(incoming, key)) out[key] = sameTypeRule(out[key], incoming[key]);
  return out;
}
function memberByToken(room, token) {
  return room?.members?.find((m) => String(m?.token || "") === String(token || "")) || null;
}
function ownerByToken(room, token) {
  const member = memberByToken(room, token);
  return member && member.id === room?.ownerId ? member : null;
}

export function roomSettingsSnapshot(room, token) {
  const owner = ownerByToken(room, token);
  if (!owner) return null;
  const bv = ensureFeatureState(room);
  return {
    roomId: room.id,
    roomName: room.name || "",
    gameId: room.gameId,
    privateRoom: !!room.privateRoom,
    queueEnabled: !!room.settings?.queueEnabled,
    rotationPolicy: room.settings?.rotationPolicy || "winner_stays",
    rules: structuredClone(room.rules || {}),
    clockConfig: structuredClone(bv.clockConfig || { mode: "untimed" }),
    playerChatSlowSeconds: Math.round(Number(bv.playerChatSlowMs || 0) / 1000),
    spectatorChatSlowSeconds: Math.round(Number(bv.spectatorChatSlowMs || 0) / 1000),
    focusGuardEnabled: bv.focusGuardEnabled !== false,
    focusGuardAllowedLeaves: clampInt(bv.focusGuardAllowedLeaves, 0, 20, 0),
    status: room.status,
    editableCore: room.status !== "playing",
    immutable: ["roomId", "customRoomCode"],
  };
}

export function applyRoomSettings(room, token, input = {}) {
  const owner = ownerByToken(room, token);
  if (!owner) {
    const error = new Error("只有房主可以修改房間設定。");
    error.code = "owner_required";
    throw error;
  }
  const bv = ensureFeatureState(room);
  const playing = room.status === "playing";
  const wantsCore = input.rules || input.clockConfig || "queueEnabled" in input || "rotationPolicy" in input || "gameId" in input;
  if (playing && wantsCore) {
    const error = new Error("對局進行中不可變更棋類、規則、棋鐘或輪替；請在本局結束後再儲存這些設定。");
    error.code = "settings_locked_during_match";
    throw error;
  }

  room.name = cleanText(input.roomName, room.name || "BoardVerse 房間", 40);
  if ("privateRoom" in input) room.privateRoom = !!input.privateRoom;
  if (!room.settings || typeof room.settings !== "object") room.settings = {};
  if (!playing) {
    // Changing game engines in-place would invalidate current replay/state structures.
    // The game selector is exposed as read-only in the workspace; reject forged changes server-side.
    if (input.gameId && String(input.gameId) !== String(room.gameId)) {
      const error = new Error("目前房間建立後不可直接改棋類；請建立新房間以切換棋類。");
      error.code = "game_immutable";
      throw error;
    }
    if ("queueEnabled" in input && room.gameId !== "qiguo") room.settings.queueEnabled = !!input.queueEnabled;
    if (ROTATIONS.has(String(input.rotationPolicy || ""))) room.settings.rotationPolicy = String(input.rotationPolicy);
    if (input.rules && typeof input.rules === "object") room.rules = sanitizeRules(room.rules, input.rules);
    if (input.clockConfig && typeof input.clockConfig === "object") bv.clockConfig = normalizeClockConfig(input.clockConfig);
  }
  if ("playerChatSlowSeconds" in input) bv.playerChatSlowMs = clampInt(input.playerChatSlowSeconds, 0, 3600, 0) * 1000;
  if ("spectatorChatSlowSeconds" in input) bv.spectatorChatSlowMs = clampInt(input.spectatorChatSlowSeconds, 0, 3600, 0) * 1000;
  if ("focusGuardEnabled" in input) bv.focusGuardEnabled = input.focusGuardEnabled !== false;
  if ("focusGuardAllowedLeaves" in input) bv.focusGuardAllowedLeaves = clampInt(input.focusGuardAllowedLeaves, 0, 20, 0);
  bv.focusGuardViolations = {};
  bv.focusGuardLastEvent = {};
  bv.pendingRematch = null;
  resetReady(room, false);
  bv.revision = Number(bv.revision || 0) + 1;
  bv.updatedAt = Date.now();
  room.updatedAt = Date.now();
  return roomSettingsSnapshot(room, token);
}

export async function emergencyRoomSettings(db, roomId, token, input = null) {
  if (!db) return { ok: false, status: 503, code: "database_unavailable", message: "BoardVerse D1 尚未可用。" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare("SELECT revision,room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?").bind(roomId, Date.now()).first();
    if (!row?.room_json) return { ok: false, status: 404, code: "room_not_found", message: "找不到此房間。" };
    let room;
    try { room = JSON.parse(row.room_json); } catch { return { ok: false, status: 500, code: "room_corrupt", message: "房間資料無法讀取。" }; }
    if (!input) {
      const settings = roomSettingsSnapshot(room, token);
      if (!settings) return { ok: false, status: 403, code: "owner_required", message: "只有房主可以修改房間設定。" };
      return { ok: true, settings };
    }
    let settings;
    try { settings = applyRoomSettings(room, token, input); }
    catch (error) { return { ok: false, status: 400, code: error?.code || "settings_failed", message: error?.message || "房間設定更新失敗。" }; }
    const now = Date.now();
    const result = await db.prepare("UPDATE emergency_rooms SET revision=revision+1,room_json=?,updated_at=? WHERE room_id=? AND revision=?")
      .bind(JSON.stringify(room), now, roomId, Number(row.revision || 0)).run();
    if (Number(result?.meta?.changes || result?.changes || 0) > 0) return { ok: true, settings };
  }
  return { ok: false, status: 409, code: "stale_revision", message: "房間狀態剛剛已更新，請再試一次。" };
}
