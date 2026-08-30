import { ensureFeatureState, resetReady } from "./state.js";
import { applyRoomSettings as applyBaseSettings, roomSettingsSnapshot as baseSnapshot } from "./settings-workspace.js";

function error(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function memberById(room, id) {
  return room?.members?.find((m) => String(m?.id || "") === String(id || "")) || null;
}

function targetQiguoCount(room, input) {
  if (room?.gameId !== "qiguo" || !input?.rules || !("playerCount" in input.rules)) return null;
  return Math.max(3, Math.min(7, Math.round(Number(input.rules.playerCount) || Number(room.rules?.playerCount) || 7)));
}

function assertQiguoCapacity(room, target) {
  if (target == null) return;
  const occupied = (room.seats || []).filter(Boolean);
  if (occupied.length > target) throw error(`目前已有 ${occupied.length} 位玩家入席，不能把七國象棋縮成 ${target} 人。`, "player_count_too_small");
}

function applyQiguoCapacity(room, target) {
  if (target == null || room.gameId !== "qiguo") return false;
  const occupied = (room.seats || []).filter(Boolean);
  if ((room.seats || []).length === target) return false;
  room.seats = [...occupied, ...Array(Math.max(0, target - occupied.length)).fill(null)];
  for (const member of room.members || []) {
    if (!member) continue;
    if (room.seats.includes(member.id)) member.role = "player";
    else if (member.role === "player") { member.role = "spectator"; member.side = null; member.countries = []; }
  }
  resetReady(room, false);
  return true;
}

function nonSeatedMembers(room) {
  const seats = new Set((room?.seats || []).filter(Boolean));
  return (room?.members || []).filter((m) => m && !seats.has(m.id) && m.role !== "pending");
}

export function roomSettingsSnapshot(room, token, { voiceAvailable = true } = {}) {
  const snapshot = baseSnapshot(room, token);
  if (!snapshot) return null;
  const bv = ensureFeatureState(room);
  return {
    ...snapshot,
    voiceEnabled: voiceAvailable ? !!bv.voiceEnabled : false,
    voiceAvailable: !!voiceAvailable && room.gameId !== "qiguo",
  };
}

export async function applyRoomSettings(room, token, input = {}, { voiceAvailable = true } = {}) {
  const bv = ensureFeatureState(room);
  const requestedVoice = "voiceEnabled" in input ? !!input.voiceEnabled : !!bv.voiceEnabled;
  const voiceChanged = requestedVoice !== !!bv.voiceEnabled;
  const qiguoTarget = targetQiguoCount(room, input);

  if (voiceChanged) {
    if (room.status === "playing") throw error("對局進行中不可變更 P2P 語音設定。", "settings_locked_during_match");
    if (requestedVoice && !voiceAvailable) throw error("緊急 D1 模式不提供 P2P 語音；完整模式恢復後才能啟用。", "voice_unavailable_emergency");
    if (requestedVoice && room.gameId === "qiguo") throw error("七國象棋不提供 1v1 P2P 語音。", "voice_unsupported_game");
    if (requestedVoice && ((room.queue || []).length || nonSeatedMembers(room).length)) {
      throw error("啟用 P2P 語音前，請先清空排隊並讓觀眾離開房間。", "voice_requires_two_players");
    }
  }
  assertQiguoCapacity(room, qiguoTarget);

  const saved = await applyBaseSettings(room, token, input);
  const after = ensureFeatureState(room);
  let postChanged = false;

  if (applyQiguoCapacity(room, qiguoTarget)) postChanged = true;
  if (voiceChanged) {
    after.voiceEnabled = requestedVoice;
    if (requestedVoice) room.settings.queueEnabled = false;
    after.pendingRematch = null;
    resetReady(room, false);
    postChanged = true;
  }
  if (room.gameId === "qiguo" && after.voiceEnabled) {
    after.voiceEnabled = false;
    postChanged = true;
  }
  if (postChanged) {
    after.updatedAt = Date.now();
    room.updatedAt = Date.now();
  }
  return roomSettingsSnapshot(room, token, { voiceAvailable });
}

export async function emergencyRoomSettings(db, roomId, token, input = null) {
  if (!db) return { ok: false, status: 503, code: "database_unavailable", message: "BoardVerse D1 尚未可用。" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare("SELECT revision,room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?").bind(roomId, Date.now()).first();
    if (!row?.room_json) return { ok: false, status: 404, code: "room_not_found", message: "找不到此房間。" };
    let room;
    try { room = JSON.parse(row.room_json); }
    catch { return { ok: false, status: 500, code: "room_corrupt", message: "房間資料無法讀取。" }; }
    if (!input) {
      const settings = roomSettingsSnapshot(room, token, { voiceAvailable: false });
      if (!settings) return { ok: false, status: 403, code: "owner_required", message: "只有房主可以修改房間設定。" };
      return { ok: true, settings };
    }
    let settings;
    try { settings = await applyRoomSettings(room, token, input, { voiceAvailable: false }); }
    catch (e) {
      const status = e?.code === "owner_required" ? 403 : e?.code === "stale_revision" ? 409 : 400;
      return { ok: false, status, code: e?.code || "settings_failed", message: e?.message || "房間設定更新失敗。" };
    }
    const result = await db.prepare("UPDATE emergency_rooms SET revision=revision+1,room_json=?,updated_at=? WHERE room_id=? AND revision=?")
      .bind(JSON.stringify(room), Date.now(), roomId, Number(row.revision || 0)).run();
    if (Number(result?.meta?.changes || result?.changes || 0) > 0) return { ok: true, settings };
  }
  return { ok: false, status: 409, code: "stale_revision", message: "房間狀態剛剛已更新，請再試一次。" };
}
