import { GameRoom as BaseGameRoom } from "../index-v017.js";
import { appendEvent, ensureFeatureState, requireRevision, resetReady } from "./state.js";
import { json, errorJson } from "../core/http.js";

const MAX_ALLOWED_LEAVES = 20;

function memberByToken(room, token) {
  return room?.members?.find((member) => member?.token === token) || null;
}

function clampAllowedLeaves(value) {
  return Math.max(0, Math.min(MAX_ALLOWED_LEAVES, Math.round(Number(value) || 0)));
}

function focusState(room) {
  const bv = ensureFeatureState(room);
  if (typeof bv.focusGuardEnabled !== "boolean") bv.focusGuardEnabled = true;
  bv.focusGuardAllowedLeaves = clampAllowedLeaves(bv.focusGuardAllowedLeaves);
  if (!bv.focusGuardViolations || typeof bv.focusGuardViolations !== "object") bv.focusGuardViolations = {};
  if (!bv.focusGuardLastEvent || typeof bv.focusGuardLastEvent !== "object") bv.focusGuardLastEvent = {};
  if (!("focusGuardMatchId" in bv)) bv.focusGuardMatchId = null;
  return bv;
}

function publicActor(member) {
  return member ? { memberId: member.id, userId: member.userId || null, name: member.name, side: member.side || null } : null;
}

function isSeatedPlayer(room, member) {
  return !!member && member.role === "player" && Array.isArray(room?.seats) && room.seats.includes(member.id);
}

function safeEventId(value) {
  const id = String(value || "").replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
  return id || crypto.randomUUID();
}

function safeCause(value) {
  const cause = String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return cause || "unknown";
}

export class FocusGuardGameRoom extends BaseGameRoom {
  async loadRoom() {
    const room = await super.loadRoom();
    if (room) focusState(room);
    return room;
  }

  async initRoom(request) {
    const body = await request.clone().json().catch(() => ({}));
    const response = await super.initRoom(request);
    if (!response.ok || !this.room) return response;
    const bv = focusState(this.room);
    const feature = body.feature || {};
    bv.focusGuardEnabled = feature.focusGuardEnabled !== false;
    bv.focusGuardAllowedLeaves = clampAllowedLeaves(feature.focusGuardAllowedLeaves);
    bv.focusGuardViolations = {};
    bv.focusGuardLastEvent = {};
    bv.focusGuardMatchId = null;
    await this.saveRoom();
    return response;
  }

  maybeStartMatch() {
    const started = super.maybeStartMatch();
    if (!started || !this.room || this.room.status !== "playing") return started;
    const bv = focusState(this.room);
    bv.focusGuardViolations = {};
    bv.focusGuardLastEvent = {};
    bv.focusGuardMatchId = bv.gameInstanceId;
    appendEvent(this.room, "focus_guard_started", null, {
      enabled: !!bv.focusGuardEnabled,
      allowedLeaves: bv.focusGuardAllowedLeaves,
      gameInstanceId: bv.gameInstanceId,
    });
    return started;
  }

  send(ws, payload) {
    if (payload?.type === "feature_state" && payload.feature && this.room) {
      const bv = focusState(this.room);
      const token = (ws?.deserializeAttachment?.() || {}).token || "";
      const member = memberByToken(this.room, token);
      const active = this.room.status === "playing" && bv.focusGuardMatchId === bv.gameInstanceId;
      payload.feature.focusGuardEnabled = !!bv.focusGuardEnabled;
      payload.feature.focusGuardAllowedLeaves = bv.focusGuardAllowedLeaves;
      payload.feature.focusGuardActive = active;
      payload.feature.myFocusGuardViolations = member ? Number(bv.focusGuardViolations[member.id] || 0) : 0;
      payload.feature.canConfigureFocusGuard = !!member && member.id === this.room.ownerId && this.room.status !== "playing";
    }
    return super.send(ws, payload);
  }

  async webSocketMessage(ws, message) {
    let parsed = null;
    try { parsed = typeof message === "string" ? JSON.parse(message) : null; } catch {}
    if (parsed?.type !== "focus_guard_settings" && parsed?.type !== "focus_violation") {
      return super.webSocketMessage(ws, message);
    }
    await this.loadRoom();
    if (!this.room) return;
    const token = (ws?.deserializeAttachment?.() || {}).token || "";
    const member = memberByToken(this.room, token);
    if (!member) {
      this.send(ws, { type: "error", code: "session_invalid", message: "工作階段已失效。" });
      return;
    }
    try {
      if (parsed.type === "focus_guard_settings") await this.handleFocusGuardSettings(member, parsed);
      else await this.handleFocusViolation(member, parsed);
    } catch (error) {
      this.send(ws, { type: "error", code: error?.code || "focus_guard_failed", expectedRevision: error?.expectedRevision, message: error?.message || "防切頁規則操作失敗。" });
    }
  }

  async handleFocusGuardSettings(member, msg) {
    const room = this.room, bv = focusState(room);
    requireRevision(room, msg.revision);
    if (member.id !== room.ownerId) throw new Error("只有房主可以修改防切頁規則。");
    if (room.status === "playing") throw new Error("對局進行中不能修改防切頁規則。");
    bv.focusGuardEnabled = msg.enabled !== false;
    bv.focusGuardAllowedLeaves = clampAllowedLeaves(msg.allowedLeaves);
    bv.focusGuardViolations = {};
    bv.focusGuardLastEvent = {};
    bv.focusGuardMatchId = null;
    bv.pendingRematch = null;
    resetReady(room, false);
    appendEvent(room, "focus_guard_updated", publicActor(member), {
      enabled: bv.focusGuardEnabled,
      allowedLeaves: bv.focusGuardAllowedLeaves,
    });
    await this.saveRoom();
    await this.syncLobby();
    await this.broadcastState();
  }

  async handleFocusViolation(member, msg) {
    const room = this.room, bv = focusState(room);
    if (!bv.focusGuardEnabled || room.status !== "playing" || bv.focusGuardMatchId !== bv.gameInstanceId || !isSeatedPlayer(room, member)) {
      return { ignored: true };
    }
    const eventId = safeEventId(msg.eventId);
    if (bv.focusGuardLastEvent[member.id] === eventId) return { duplicate: true };
    bv.focusGuardLastEvent[member.id] = eventId;
    const cause = safeCause(msg.cause);
    const count = Number(bv.focusGuardViolations[member.id] || 0) + 1;
    bv.focusGuardViolations[member.id] = count;
    const allowed = bv.focusGuardAllowedLeaves;
    appendEvent(room, "focus_guard_violation", publicActor(member), { eventId, cause, count, allowedLeaves: allowed });

    if (count > allowed) {
      const reason = `${member.name} 離開比賽畫面，超過防切頁規則允許次數（允許 ${allowed} 次）`;
      this._focusGuardFinishReason = reason;
      try {
        await super.resign(member.token);
      } finally {
        if (this.room?.status === "playing") this._focusGuardFinishReason = null;
      }
      if (this.room?.status === "playing") {
        appendEvent(this.room, "focus_guard_forfeit_applied", publicActor(member), { count, allowedLeaves: allowed, reason });
        await this.saveRoom();
        await this.broadcastState();
      }
      return { forfeited: true, count, allowedLeaves: allowed };
    }

    await this.saveRoom();
    await this.broadcastState();
    return { forfeited: false, count, allowedLeaves: allowed };
  }

  async finishMatch(result) {
    const reason = this._focusGuardFinishReason;
    try {
      return await super.finishMatch(reason ? { ...(result || {}), reason, focusGuard: true } : result);
    } finally {
      this._focusGuardFinishReason = null;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/feature/focus-violation" && request.method === "POST") {
      await this.loadRoom();
      if (!this.room) return errorJson("找不到此房間。", 404, "room_not_found");
      const body = await request.json().catch(() => ({}));
      const member = memberByToken(this.room, String(body.token || ""));
      if (!member) return errorJson("工作階段已失效。", 401, "session_invalid");
      try {
        const result = await this.handleFocusViolation(member, {
          type: "focus_violation",
          eventId: body.eventId,
          cause: body.cause,
        });
        return json({ ok: true, ...(result || {}) });
      } catch (error) {
        return errorJson(error?.message || "防切頁判定失敗。", 400, error?.code || "focus_guard_failed");
      }
    }
    return super.fetch(request);
  }
}

export const GameRoom = FocusGuardGameRoom;
