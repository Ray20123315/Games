import { ensureFeatureState, requireRevision, resetReady } from "./state.js";
import { normalizeClockConfig } from "../clock/clock-engine.js";

const ROTATIONS = new Set(["winner_stays", "rotate_both", "host_stays"]);
const SIDE_MODES = Object.freeze({
  go: new Set(["guess", "random", "manual"]),
  gomoku: new Set(["guess", "random", "manual"]),
  renju: new Set(["guess", "random", "manual"]),
  xiangqi: new Set(["random", "manual"]),
  chess: new Set(["hidden", "random", "manual"]),
  reversi: new Set(["guess", "random", "manual"]),
});

function cleanText(value, fallback = "", max = 40) {
  const out = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return out || fallback;
}
function cleanPlayerName(value) {
  const out = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  if (!out) {
    const error = new Error("名稱不能是空白。");
    error.code = "invalid_name";
    throw error;
  }
  return out;
}
function normalizeNameKey(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}
function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function clampNumber(value, min, max, fallback, step = null) {
  let n = Number(value);
  if (!Number.isFinite(n)) n = fallback;
  n = Math.max(min, Math.min(max, n));
  if (step) n = Math.round(n / step) * step;
  return n;
}
function gameFamily(gameId) {
  if (["go9", "go13", "go19"].includes(gameId)) return "go";
  if (gameId === "xiangqi_random") return "xiangqi";
  return String(gameId || "");
}
function allowed(value, choices, fallback) {
  return choices.includes(String(value)) ? String(value) : fallback;
}
function sanitizeRules(gameId, current, incoming) {
  const out = { ...(current || {}) };
  if (!incoming || typeof incoming !== "object") return out;
  const family = gameFamily(gameId);
  const has = (key) => Object.prototype.hasOwnProperty.call(incoming, key) && Object.prototype.hasOwnProperty.call(out, key);
  if (family === "go") {
    if (has("ruleset")) out.ruleset = allowed(incoming.ruleset, ["chinese", "japanese", "aga", "newzealand"], out.ruleset);
    if (has("scoring")) out.scoring = allowed(incoming.scoring, ["area", "territory"], out.scoring);
    if (has("komi")) out.komi = clampNumber(incoming.komi, 0, 20, Number(out.komi) || 0, 0.5);
    if (has("koRule")) out.koRule = allowed(incoming.koRule, ["simple", "superko"], out.koRule);
    if (has("suicide")) out.suicide = !!incoming.suicide;
    if (has("mode")) out.mode = allowed(incoming.mode, ["standard", "capture"], out.mode);
    if (has("captureGoal")) out.captureGoal = clampInt(incoming.captureGoal, 1, 20, Number(out.captureGoal) || 1);
    if (has("handicap")) out.handicap = clampInt(incoming.handicap, 0, 9, Number(out.handicap) || 0);
  } else if (family === "gomoku") {
    if (has("variant")) out.variant = allowed(incoming.variant, ["freestyle", "exact5", "connect6"], out.variant);
    if (has("boardSize")) out.boardSize = [15, 19].includes(Number(incoming.boardSize)) ? Number(incoming.boardSize) : out.boardSize;
    if (has("opening")) out.opening = allowed(incoming.opening, ["none", "pro", "swap"], out.opening);
    if (out.variant === "connect6") out.opening = "none";
  } else if (family === "renju") {
    if (has("opening")) out.opening = "free";
  } else if (family === "xiangqi") {
    if (has("stalemateLoss")) out.stalemateLoss = !!incoming.stalemateLoss;
  } else if (family === "chess") {
    if (has("variant")) out.variant = allowed(incoming.variant, ["standard", "threecheck", "koth"], out.variant);
    for (const key of ["threefold", "fiftyMove", "insufficient"]) if (has(key)) out[key] = !!incoming[key];
  } else if (family === "reversi") {
    if (has("boardSize")) out.boardSize = [6, 8, 10].includes(Number(incoming.boardSize)) ? Number(incoming.boardSize) : out.boardSize;
    if (has("objective")) out.objective = allowed(incoming.objective, ["normal", "misere"], out.objective);
  } else if (family === "qiguo") {
    if (has("playerCount")) out.playerCount = clampInt(incoming.playerCount, 3, 7, Number(out.playerCount) || 7);
    if (has("drawMode")) out.drawMode = allowed(incoming.drawMode, ["country", "number"], out.drawMode);
  }
  if (has("sideMode") && SIDE_MODES[family]?.has(String(incoming.sideMode))) out.sideMode = String(incoming.sideMode);
  return out;
}
function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}
function memberByToken(room, token) {
  return room?.members?.find((m) => String(m?.token || "") === String(token || "")) || null;
}
function memberById(room, id) {
  return room?.members?.find((m) => String(m?.id || "") === String(id || "")) || null;
}
function ownerByToken(room, token) {
  const member = memberByToken(room, token);
  return member && member.id === room?.ownerId ? member : null;
}
function ownerUsesAccountIdentity(room, owner, bv) {
  return !!(owner?.userId || bv?.memberUsers?.[owner?.id]);
}
function disableQueue(room) {
  if (!Array.isArray(room?.queue) || !room.queue.length) return;
  for (const id of room.queue.splice(0)) {
    const member = memberById(room, id);
    if (member) { member.role = "spectator"; member.side = null; }
  }
}
function coreSettingsChanged(room, bv, input) {
  if (input.gameId && String(input.gameId) !== String(room.gameId)) return true;
  if ("queueEnabled" in input && room.gameId !== "qiguo" && !!input.queueEnabled !== !!room.settings?.queueEnabled) return true;
  if ("rotationPolicy" in input && ROTATIONS.has(String(input.rotationPolicy)) && String(input.rotationPolicy) !== String(room.settings?.rotationPolicy || "winner_stays")) return true;
  if (input.rules && typeof input.rules === "object" && !sameJson(sanitizeRules(room.gameId, room.rules, input.rules), room.rules || {})) return true;
  if (input.clockConfig && typeof input.clockConfig === "object" && !sameJson(normalizeClockConfig(input.clockConfig), normalizeClockConfig(bv.clockConfig || { mode: "untimed" }))) return true;
  if ("focusGuardEnabled" in input && (input.focusGuardEnabled !== false) !== (bv.focusGuardEnabled !== false)) return true;
  if ("focusGuardAllowedLeaves" in input && clampInt(input.focusGuardAllowedLeaves, 0, 20, 0) !== clampInt(bv.focusGuardAllowedLeaves, 0, 20, 0)) return true;
  return false;
}
function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
async function deriveReturnPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}
async function makePasswordRecord(password) {
  const text = String(password ?? "");
  if (!text) return null;
  if (text.length > 128) {
    const error = new Error("回場密碼最多 128 個字元。");
    error.code = "password_too_long";
    throw error;
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  return { passwordSalt: bytesToBase64(saltBytes), passwordHash: await deriveReturnPassword(text, saltBytes) };
}

export function roomSettingsSnapshot(room, token) {
  const owner = ownerByToken(room, token);
  if (!owner) return null;
  const bv = ensureFeatureState(room);
  return {
    roomId: room.id,
    roomName: room.name || "",
    ownerName: owner.name || "",
    ownerNameEditable: !ownerUsesAccountIdentity(room, owner, bv),
    hasReturnPassword: !!(owner.passwordHash && owner.passwordSalt),
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
    revision: Number(bv.revision || 0),
    status: room.status,
    editableCore: room.status !== "playing",
    immutable: ["roomId", "customRoomCode"],
  };
}

export async function applyRoomSettings(room, token, input = {}) {
  const owner = ownerByToken(room, token);
  if (!owner) {
    const error = new Error("只有房主可以修改房間設定。");
    error.code = "owner_required";
    throw error;
  }
  const bv = ensureFeatureState(room);
  requireRevision(room, input.revision);
  const playing = room.status === "playing";
  const accountBound = ownerUsesAccountIdentity(room, owner, bv);
  const requestedName = "ownerName" in input ? cleanPlayerName(input.ownerName) : owner.name;
  const ownerNameChanged = requestedName !== owner.name;
  const coreChanged = coreSettingsChanged(room, bv, input) || ownerNameChanged;
  if (playing && coreChanged) {
    const error = new Error("對局進行中不可變更玩家名稱、棋類、規則、棋鐘、輪替或防切頁規則；請在本局結束後再儲存這些設定。");
    error.code = "settings_locked_during_match";
    throw error;
  }
  if (ownerNameChanged && accountBound) {
    const error = new Error("登入會員的房內名稱由帳號名稱管理；請到帳號設定變更名稱。");
    error.code = "account_name_managed";
    throw error;
  }

  room.name = cleanText(input.roomName, room.name || "BoardVerse 房間", 40);
  if ("privateRoom" in input) room.privateRoom = !!input.privateRoom;
  if (!room.settings || typeof room.settings !== "object") room.settings = {};

  if (!playing) {
    if (input.gameId && String(input.gameId) !== String(room.gameId)) {
      const error = new Error("目前房間建立後不可直接改棋類；請建立新房間以切換棋類。");
      error.code = "game_immutable";
      throw error;
    }
    if (ownerNameChanged) {
      const key = normalizeNameKey(requestedName);
      if ((room.members || []).some((m) => m?.id !== owner.id && normalizeNameKey(m?.name) === key)) {
        const error = new Error("這個名稱已經有人使用。");
        error.code = "name_taken";
        throw error;
      }
      owner.name = requestedName;
      owner.nameKey = key;
      owner.updatedAt = Date.now();
      if (bv.memberIdentities?.[owner.id]?.role === "guest") bv.memberIdentities[owner.id].name = requestedName;
    }
    if ("queueEnabled" in input && room.gameId !== "qiguo") {
      room.settings.queueEnabled = !!input.queueEnabled;
      if (!room.settings.queueEnabled) disableQueue(room);
    }
    if (ROTATIONS.has(String(input.rotationPolicy || ""))) room.settings.rotationPolicy = String(input.rotationPolicy);
    if (input.rules && typeof input.rules === "object") room.rules = sanitizeRules(room.gameId, room.rules, input.rules);
    if (input.clockConfig && typeof input.clockConfig === "object") bv.clockConfig = normalizeClockConfig(input.clockConfig);
    if ("focusGuardEnabled" in input) bv.focusGuardEnabled = input.focusGuardEnabled !== false;
    if ("focusGuardAllowedLeaves" in input) bv.focusGuardAllowedLeaves = clampInt(input.focusGuardAllowedLeaves, 0, 20, 0);
    if (coreChanged) {
      bv.focusGuardViolations = {};
      bv.focusGuardLastEvent = {};
      bv.focusGuardMatchId = null;
      bv.pendingRematch = null;
      resetReady(room, false);
    }
  }

  const returnPassword = String(input.returnPassword ?? "");
  if (returnPassword) {
    const record = await makePasswordRecord(returnPassword);
    owner.passwordSalt = record.passwordSalt;
    owner.passwordHash = record.passwordHash;
    owner.updatedAt = Date.now();
  } else if (input.clearReturnPassword === true) {
    owner.passwordSalt = null;
    owner.passwordHash = null;
    owner.updatedAt = Date.now();
  }

  if ("playerChatSlowSeconds" in input) bv.playerChatSlowMs = clampInt(input.playerChatSlowSeconds, 0, 3600, 0) * 1000;
  if ("spectatorChatSlowSeconds" in input) bv.spectatorChatSlowMs = clampInt(input.spectatorChatSlowSeconds, 0, 3600, 0) * 1000;
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
    try { settings = await applyRoomSettings(room, token, input); }
    catch (error) {
      const status = error?.code === "owner_required" ? 403 : error?.code === "stale_revision" ? 409 : 400;
      return { ok: false, status, code: error?.code || "settings_failed", message: error?.message || "房間設定更新失敗。" };
    }
    const now = Date.now();
    const result = await db.prepare("UPDATE emergency_rooms SET revision=revision+1,room_json=?,updated_at=? WHERE room_id=? AND revision=?")
      .bind(JSON.stringify(room), now, roomId, Number(row.revision || 0)).run();
    if (Number(result?.meta?.changes || result?.changes || 0) > 0) return { ok: true, settings };
  }
  return { ok: false, status: 409, code: "stale_revision", message: "房間狀態剛剛已更新，請再試一次。" };
}
