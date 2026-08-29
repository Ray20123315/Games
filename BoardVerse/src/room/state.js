import { normalizeClockConfig } from "../clock/clock-engine.js";

export function ensureFeatureState(room, now = Date.now()) {
  if (!room) return null;
  if (!room.bv || typeof room.bv !== "object") {
    const ready = {};
    for (const id of room.seats || []) if (id) ready[id] = room.status === "playing";
    room.bv = {
      schemaVersion: 1,
      revision: 0,
      gameInstanceId: crypto.randomUUID(),
      ready,
      pendingUndo: null,
      pendingRematch: null,
      lastUndoSnapshot: null,
      events: [],
      clockConfig: { mode: "untimed" },
      clock: null,
      deadlines: {},
      voiceEnabled: false,
      roomCodeType: "random",
      ownerGraceMs: null,
      ownerDisconnectedAt: null,
      closed: false,
      playerChatSlowMs: 0,
      spectatorChatSlowMs: 0,
      memberUsers: {},
      createdAt: now,
      updatedAt: now,
    };
  }
  const bv = room.bv;
  if (!Number.isInteger(bv.revision)) bv.revision = 0;
  if (!bv.gameInstanceId) bv.gameInstanceId = crypto.randomUUID();
  if (!bv.ready || typeof bv.ready !== "object") bv.ready = {};
  if (!Array.isArray(bv.events)) bv.events = [];
  if (!bv.deadlines || typeof bv.deadlines !== "object") bv.deadlines = {};
  if (!bv.memberUsers || typeof bv.memberUsers !== "object") bv.memberUsers = {};
  if (!bv.clockConfig) bv.clockConfig = { mode: "untimed" };
  bv.clockConfig = normalizeClockConfig(bv.clockConfig);
  for (const id of room.seats || []) if (id && !(id in bv.ready)) bv.ready[id] = room.status === "playing";
  for (const id of Object.keys(bv.ready)) if (!(room.seats || []).includes(id)) delete bv.ready[id];
  bv.updatedAt = now;
  return bv;
}

export function appendEvent(room, type, actor = null, payload = null, now = Date.now()) {
  const bv = ensureFeatureState(room, now);
  bv.revision += 1;
  const event = { seq: bv.events.length + 1, revision: bv.revision, gameInstanceId: bv.gameInstanceId, type, actor, payload, serverTimestamp: now };
  bv.events.push(event);
  if (bv.events.length > 4000) bv.events = bv.events.slice(-4000).map((e, i) => ({ ...e, seq: i + 1 }));
  return event;
}

export function requireRevision(room, revision) {
  const bv = ensureFeatureState(room);
  if (!Number.isInteger(Number(revision)) || Number(revision) !== bv.revision) {
    const error = new Error(`狀態已更新；請重新同步後再操作。`);
    error.code = "stale_revision";
    error.expectedRevision = bv.revision;
    throw error;
  }
}

export function gameSnapshot(room) {
  const bv = ensureFeatureState(room);
  return {
    game: structuredClone(room.game),
    clock: structuredClone(bv.clock),
    revision: bv.revision,
    gameInstanceId: bv.gameInstanceId,
    matchSeq: room.matchSeq,
    capturedAt: Date.now(),
  };
}

export function resetReady(room, value = false) {
  const bv = ensureFeatureState(room);
  bv.ready = {};
  for (const id of room.seats || []) if (id) bv.ready[id] = !!value;
}

export function allPlayersReady(room) {
  const bv = ensureFeatureState(room);
  return Array.isArray(room?.seats) && room.seats.length >= 2 && room.seats.every((id) => !!id && bv.ready[id] === true);
}
