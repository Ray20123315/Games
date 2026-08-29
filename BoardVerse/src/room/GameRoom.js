import { GameRoom as LegacyGameRoom } from "../legacy/runtime-v029.js";
import { createClock, completeLegalMove, settleActive, publicClock } from "../clock/clock-engine.js";
import { DEFAULT_ROOM_CHAT_SLOW_MS, MAX_ROOM_CHAT_SLOW_MS } from "../core/config.js";
import { json, errorJson } from "../core/http.js";
import { first, run } from "../core/db.js";
import { archiveReplay } from "../replay/archive.js";
import { awardGameGp, noteActivity } from "../membership/membership.js";
import { allPlayersReady, appendEvent, ensureFeatureState, gameSnapshot, requireRevision, resetReady } from "./state.js";
import { assertOwner, assertPlayer, otherPlayer } from "./roles.js";
import { cancelDeadline, dueDeadlines, nextDeadline, setDeadline, syncOfflineDeadlines } from "./deadline-scheduler.js";
import { parseWsMessage } from "../protocol/messages.js";

function memberById(room, id) { return room?.members?.find((m) => m.id === id) || null; }
function memberByToken(room, token) { return room?.members?.find((m) => m.token === token) || null; }
function sideFor(gameId, seat) {
  if (gameId === "qiguo") return null;
  if (gameId === "chess") return seat === 0 ? "W" : "B";
  if (["xiangqi", "xiangqi_random", "banqi"].includes(gameId)) return seat === 0 ? "R" : "B";
  return seat === 0 ? "B" : "W";
}
function isQiguo(room) { return room?.gameId === "qiguo"; }
function seatedPlayers(room) { return (room?.seats || []).map((id) => memberById(room, id)).filter(Boolean); }
function allSeatsFilled(room) { return Array.isArray(room?.seats) && room.seats.length >= 2 && room.seats.every(Boolean); }
function publicActor(member) { return member ? { memberId: member.id, userId: member.userId || null, name: member.name, side: member.side || null } : null; }
function clampSlow(v) { return Math.max(0, Math.min(MAX_ROOM_CHAT_SLOW_MS, Math.round(Number(v) || 0))); }

async function assertAccountAllowed(env, room, member) {
  if (!env?.BOARDVERSE_DB || !member) return;
  const bv = ensureFeatureState(room);
  const userId = bv.memberUsers?.[member.id] || member.userId || null;
  if (!userId || String(userId).startsWith("admin:")) return;
  const row = await first(env.BOARDVERSE_DB, "SELECT status,suspended_until FROM users WHERE id=?", userId);
  if (!row) return;
  const now = Date.now();
  if (row.status === "suspended" && Number(row.suspended_until || 0) <= now) {
    await run(env.BOARDVERSE_DB, "UPDATE users SET status='active',suspended_until=NULL,updated_at=? WHERE id=?", now, userId);
    return;
  }
  if (row.status !== "active" || Number(row.suspended_until || 0) > now) {
    const error = new Error("帳號目前已停權、封禁或停用，不能繼續執行玩家操作。");
    error.code = "account_restricted";
    throw error;
  }
  await noteActivity(env.BOARDVERSE_DB, userId, now).catch(() => {});
}

async function assertRoomChatAllowed(env, room, member) {
  if (!env?.BOARDVERSE_DB || !member) return;
  const bv=ensureFeatureState(room), userId=bv.memberUsers?.[member.id]||member.userId||null;
  if (!userId || String(userId).startsWith("admin:")) return;
  const mute=await first(env.BOARDVERSE_DB,"SELECT muted_until FROM chat_mutes WHERE subject_type='user' AND subject_id=? AND channel IN ('room','all') ORDER BY muted_until DESC LIMIT 1",userId);
  if(Number(mute?.muted_until||0)>Date.now()){const error=new Error("你目前被禁止在房內聊天室發言。");error.code="chat_muted";throw error;}
}

export class GameRoom extends LegacyGameRoom {
  async loadRoom() {
    const room = await super.loadRoom();
    if (room) ensureFeatureState(room);
    return room;
  }

  async initRoom(request) {
    const body = await request.clone().json().catch(() => ({}));
    const response = await super.initRoom(request);
    if (!response.ok || !this.room) return response;
    const bv = ensureFeatureState(this.room);
    const feature = body.feature || {};
    bv.clockConfig = isQiguo(this.room) ? { mode: "untimed" } : (feature.clockConfig || { mode: "untimed" });
    bv.voiceEnabled = isQiguo(this.room) ? false : !!feature.voiceEnabled;
    bv.roomCodeType = feature.roomCodeType === "custom" ? "custom" : "random";
    bv.ownerGraceMs = bv.roomCodeType === "custom" ? Math.max(60_000, Number(feature.ownerGraceMs) || 10 * 60_000) : null;
    bv.playerChatSlowMs = clampSlow(feature.playerChatSlowMs ?? DEFAULT_ROOM_CHAT_SLOW_MS);
    bv.spectatorChatSlowMs = clampSlow(feature.spectatorChatSlowMs ?? DEFAULT_ROOM_CHAT_SLOW_MS);
    if (bv.voiceEnabled || isQiguo(this.room)) this.room.settings.queueEnabled = false;
    resetReady(this.room, false);
    const owner = memberById(this.room, this.room.ownerId);
    if (feature.ownerUserId && owner) {
      bv.memberUsers[owner.id] = String(feature.ownerUserId);
      owner.userId = String(feature.ownerUserId);
    }
    appendEvent(this.room, "game_created", publicActor(owner), { gameId: this.room.gameId, rules: this.room.rules, clockConfig: bv.clockConfig, voiceEnabled: bv.voiceEnabled });
    await this.saveRoom();
    return response;
  }

  async enterRoom(request) {
    const room = await this.loadRoom();
    if (!room) return errorJson("找不到此房間。", 404, "room_not_found");
    const bv = ensureFeatureState(room);
    if (bv.closed) return errorJson("此房間已由管理員關閉。", 410, "room_closed");
    const body = await request.clone().json().catch(() => ({}));
    if (bv.voiceEnabled && body.role === "spectator") return errorJson("語音房不提供觀戰；房內只允許兩位實際玩家。", 409, "voice_no_spectators");
    return super.enterRoom(request);
  }

  async roomInfo() {
    const base = await super.roomInfo();
    if (!base.ok) return base;
    const data = await base.json();
    const bv = ensureFeatureState(this.room);
    data.room.voiceEnabled = !!bv.voiceEnabled;
    data.room.spectatorAllowed = !bv.voiceEnabled;
    data.room.readyRequired = true;
    data.room.closed = !!bv.closed;
    if (bv.closed) data.room.playerAction = "disabled";
    return json(data);
  }

  maybeStartMatch() {
    const room = this.room;
    if (!room || !allSeatsFilled(room)) {
      if (room && room.status !== "finished") room.status = "waiting";
      return false;
    }
    const bv = ensureFeatureState(room);
    for (const id of room.seats) if (!(id in bv.ready)) bv.ready[id] = false;
    if (!allPlayersReady(room)) {
      if (room.status !== "finished") room.status = "waiting";
      return false;
    }
    bv.gameInstanceId = crypto.randomUUID();
    bv.pendingUndo = null;
    bv.pendingRematch = null;
    bv.lastUndoSnapshot = null;
    bv.gameStartedAt = null;
    bv.clock = null;
    const started = super.maybeStartMatch();
    if (!started) return false;
    this.ensureFeatureGameStarted(Date.now());
    return true;
  }

  ensureFeatureGameStarted(now = Date.now()) {
    const room = this.room;
    if (!room || room.status !== "playing" || (room.opening && !room.opening.resolved)) return false;
    const bv = ensureFeatureState(room);
    if (bv.gameStartedAt) return false;
    const players = seatedPlayers(room);
    const startedAt = Number(room.startedAt || now);
    bv.gameStartedAt = startedAt;
    if (!isQiguo(room) && players.length === 2 && players.every((p) => p.side)) {
      bv.clock = createClock(bv.clockConfig || { mode: "untimed" }, players.map((p) => p.side), room.game?.turn || players[0]?.side, startedAt);
    } else bv.clock = null;
    appendEvent(room, "game_started", null, { game: structuredClone(room.game), clock: publicClock(bv.clock), players: players.map(publicActor), opening: room.opening ? structuredClone(room.opening) : null }, startedAt);
    return true;
  }

  async saveRoom() {
    if (this.room) ensureFeatureState(this.room);
    const result = await super.saveRoom();
    if (this.room && this.env?.BOARDVERSE_DB && this.room.id !== "__BOARDVERSE_LOBBY__") {
      const bv = ensureFeatureState(this.room);
      const players = (this.room.seats || []).map((id) => memberById(this.room, id)).filter(Boolean).map((m) => ({ id:m.id, userId:m.userId || bv.memberUsers[m.id] || null, name:m.name, side:m.side }));
      try {
        await this.env.BOARDVERSE_DB.prepare(`INSERT INTO active_rooms(room_id,room_name,game_type,status,private_room,voice_enabled,owner_user_id,players_json,spectator_count,last_activity_at,closed_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET room_name=excluded.room_name,game_type=excluded.game_type,status=excluded.status,private_room=excluded.private_room,voice_enabled=excluded.voice_enabled,owner_user_id=excluded.owner_user_id,players_json=excluded.players_json,spectator_count=excluded.spectator_count,last_activity_at=excluded.last_activity_at,closed_at=excluded.closed_at`)
          .bind(this.room.id,this.room.name,this.room.gameId,bv.closed?"closed":this.room.status,this.room.privateRoom?1:0,bv.voiceEnabled?1:0,bv.memberUsers[this.room.ownerId]||memberById(this.room,this.room.ownerId)?.userId||null,JSON.stringify(players),this.room.members?.filter((m)=>m.role==="spectator").length||0,Date.now(),bv.closed?Date.now():null).run();
      } catch {}
    }
    return result;
  }

  async updateOfflineAlarm() {
    const room = this.room;
    if (!room) return;
    const bv = ensureFeatureState(room);
    syncOfflineDeadlines(room, bv);
    if (room.status === "playing" && bv.clock?.clockDeadlineAt) {
      setDeadline(bv, "clock", "clock_timeout", bv.clock.clockDeadlineAt, bv.clock.revision, { activePlayer: bv.clock.activePlayer, gameInstanceId: bv.gameInstanceId });
    } else cancelDeadline(bv, "clock");
    const owner = memberById(room, room.ownerId);
    if (bv.roomCodeType === "custom" && owner && !owner.connected && bv.ownerDisconnectedAt && bv.ownerGraceMs) {
      const deadline = bv.ownerDisconnectedAt + bv.ownerGraceMs;
      setDeadline(bv, "owner-grace", "owner_grace", deadline, bv.ownerGraceVersion || 1, { ownerId: owner.id });
    } else cancelDeadline(bv, "owner-grace");
    const next = nextDeadline(bv);
    const current = await this.ctx.storage.getAlarm();
    if (!next) {
      if (current != null) await this.ctx.storage.deleteAlarm();
    } else if (current == null || Math.abs(current - next.deadline) > 250) await this.ctx.storage.setAlarm(next.deadline);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/feature/attach-user" && request.method === "POST") return this.attachUser(request);
    if (url.pathname === "/admin/terminate-game" && request.method === "POST") return this.adminTerminateGame(request);
    if (url.pathname === "/admin/close-room" && request.method === "POST") return this.adminCloseRoom(request);
    return super.fetch(request);
  }

  async attachUser(request) {
    const room = await this.loadRoom();
    if (!room) return errorJson("Room not found", 404, "room_not_found");
    const body = await request.json();
    const member = memberByToken(room, String(body.token || ""));
    if (!member) return errorJson("Member not found", 404, "member_not_found");
    const bv = ensureFeatureState(room);
    if (body.userId) { member.userId = String(body.userId); bv.memberUsers[member.id] = member.userId; }
    await this.saveRoom();
    return json({ ok: true, memberId: member.id });
  }

  async acceptSocket(request, url) {
    const room = await this.loadRoom();
    if (!room || ensureFeatureState(room).closed) return errorJson("房間已關閉。", 410, "room_closed");
    const token = url.searchParams.get("token") || "";
    const member = memberByToken(room, token);
    const wasOffline = member && !member.connected;
    if (member?.id === room.ownerId) {
      const bv = ensureFeatureState(room); bv.ownerDisconnectedAt = null; bv.ownerGraceVersion = (Number(bv.ownerGraceVersion) || 0) + 1; cancelDeadline(bv, "owner-grace");
    }
    if (wasOffline) appendEvent(room, "player_reconnected", publicActor(member), null);
    return super.acceptSocket(request, url);
  }

  sendState(ws) {
    super.sendState(ws);
    this.sendFeatureState(ws);
  }

  sendFeatureState(ws) {
    const room = this.room; if (!room) return;
    const bv = ensureFeatureState(room);
    const token = (ws.deserializeAttachment?.() || {}).token || "";
    const member = memberByToken(room, token);
    this.send(ws, {
      type: "feature_state",
      feature: {
        revision: bv.revision,
        serverNow: Date.now(),
        gameInstanceId: bv.gameInstanceId,
        ready: structuredClone(bv.ready),
        pendingUndo: bv.pendingUndo ? structuredClone(bv.pendingUndo) : null,
        pendingRematch: bv.pendingRematch ? structuredClone(bv.pendingRematch) : null,
        clock: publicClock(bv.clock),
        clockConfig: structuredClone(bv.clockConfig),
        voiceEnabled: !!bv.voiceEnabled,
        roomCodeType: bv.roomCodeType,
        closed: !!bv.closed,
        myMemberId: member?.id || null,
        myUserId: member ? (bv.memberUsers[member.id] || member.userId || null) : null,
        myRole: member?.role || null,
        myReady: member ? !!bv.ready[member.id] : false,
        status: room.status,
        queueEnabled: !!room.settings?.queueEnabled,
        playerChatSlowMs: bv.playerChatSlowMs,
        spectatorChatSlowMs: bv.spectatorChatSlowMs,
        isOwner: !!member && member.id === room.ownerId,
        canReady: !!member && member.role === "player" && room.status === "waiting" && allSeatsFilled(room),
        canUndo: !!member && member.role === "player" && room.status === "playing" && !isQiguo(room),
        canVoice: !!member && member.role === "player" && !!bv.voiceEnabled && room.seats?.length === 2,
        myRematchAccepted: !!member && !!bv.pendingRematch?.acceptedIds?.includes(member.id),
        rematchRequired: room.seats?.filter(Boolean).length || 0,
      },
    });
  }

  async webSocketMessage(ws, message) {
    let msg;
    try { msg = parseWsMessage(message); }
    catch (e) { this.send(ws, { type: "error", message: e.message }); return; }
    await this.loadRoom(); if (!this.room) return;
    const token = (ws.deserializeAttachment() || {}).token || "";
    const auth = this.authToken(token);
    if (!auth) { this.send(ws, { type: "error", message: "工作階段已失效。" }); return; }
    try {
      const privileged = new Set(["ready","undo_request","undo_accept","undo_reject","rematch","rematch_request","rematch_accept","voice_signal","room_chat_settings","move","pass","swap_sides","resign","qiguo_choose","opening_guess","opening_choose","opening_hand"]);
      if (privileged.has(msg.type)) await assertAccountAllowed(this.env, this.room, auth.member);
      if (msg.type === "qiguo_choose") { await super.handleQiguoChoose(token, msg); this.ensureFeatureGameStarted(); await this.saveRoom(); await this.broadcastState(); return; }
      if (msg.type === "opening_guess") { await super.handleOpeningGuess(token, msg); this.ensureFeatureGameStarted(); await this.saveRoom(); await this.broadcastState(); return; }
      if (msg.type === "opening_choose") { await super.handleOpeningChoose(token, msg); this.ensureFeatureGameStarted(); await this.saveRoom(); await this.broadcastState(); return; }
      if (msg.type === "opening_hand") { await super.handleOpeningHand(token, msg); this.ensureFeatureGameStarted(); await this.saveRoom(); await this.broadcastState(); return; }
      if (msg.type === "ready") return await this.handleReady(auth.member, msg);
      if (msg.type === "undo_request") return await this.undoRequest(auth.member, msg);
      if (msg.type === "undo_accept") return await this.undoAccept(auth.member, msg);
      if (msg.type === "undo_reject") return await this.undoReject(auth.member, msg);
      if (msg.type === "rematch_request" || msg.type === "rematch") return await this.rematchRequest(auth.member, msg);
      if (msg.type === "rematch_accept") return await this.rematchAccept(auth.member, msg);
      if (msg.type === "voice_signal") return await this.voiceSignal(auth.member, msg);
      if (msg.type === "room_chat_settings") return await this.roomChatSettings(auth.member, msg);
      if (msg.type === "move" || msg.type === "pass") return await this.handleFeatureMove(token, auth.member, msg);
      if (msg.type === "swap_sides") { requireRevision(this.room, msg.revision); const before = this.room.game?.moveNumber; await super.swapSides(token); if (this.room.game?.moveNumber === before) { appendEvent(this.room, "move_applied", publicActor(auth.member), { kind: "swap", gameAfter: structuredClone(this.room.game), clockAfter: publicClock(ensureFeatureState(this.room).clock) }); await this.saveRoom(); await this.broadcastState(); } return; }
      if (msg.type === "resign") { requireRevision(this.room, msg.revision); appendEvent(this.room, "game_resigned", publicActor(auth.member), null); return await super.resign(token); }
      return await super.webSocketMessage(ws, message);
    } catch (error) {
      this.send(ws, { type: "error", code: error?.code || "operation_failed", expectedRevision: error?.expectedRevision, message: error?.message || "操作失敗。" });
      this.sendFeatureState(ws);
    }
  }

  async handleReady(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (room.status !== "waiting") throw new Error("目前不是準備階段。");
    bv.ready[member.id] = msg.ready !== false;
    appendEvent(room, "players_ready", publicActor(member), { memberId: member.id, ready: bv.ready[member.id], readyState: structuredClone(bv.ready) });
    if (allPlayersReady(room)) this.maybeStartMatch();
    await this.saveRoom(); await this.updateOfflineAlarm(); await this.syncLobby(); await this.broadcastState();
  }

  async handleFeatureMove(token, member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (bv.pendingUndo) throw new Error("悔棋邀請處理中，請先接受或拒絕。");
    const now = Date.now();
    const hadClock = !!bv.clock;
    const settled = bv.clock ? settleActive(bv.clock, now) : { clock: null, timedOut: false };
    if (settled.timedOut) {
      bv.clock = settled.clock;
      appendEvent(room, "timeout", publicActor(member), { clock: publicClock(bv.clock) }, now);
      const winner = otherPlayer(room, member);
      await this.finishMatch({ winner: winner?.side || null, winnerMemberId: winner?.id || null, winnerName: winner?.name || null, loserMemberId: member.id, loserName: member.name, reason: `${member.name} 棋鐘超時` });
      return;
    }
    const snapshot = gameSnapshot(room);
    this._pendingMoveContext = { member, msg: structuredClone(msg), snapshot, settledClock: settled.clock, at: now };
    try {
      await super.handleMove(token, msg.type === "pass" ? { type: "move", action: "pass" } : msg);
      this.ensureFeatureGameStarted(now);
      if (this._pendingMoveContext) {
        const completed = hadClock && settled.clock ? completeLegalMove(settled.clock, room.game?.turn, now) : { clock: bv.clock, timedOut: false };
        bv.clock = completed.clock;
        bv.lastUndoSnapshot = snapshot;
        appendEvent(room, "move_applied", publicActor(member), { move: sanitizedMove(msg), gameAfter: structuredClone(room.game), clockAfter: publicClock(bv.clock), snapshotRevision: snapshot.revision }, now);
        this._pendingMoveContext = null;
        await this.saveRoom(); await this.broadcastState();
      }
    } catch (e) { this._pendingMoveContext = null; throw e; }
  }

  async undoRequest(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (isQiguo(room)) throw new Error("七國象棋為多人持續局，暫不提供單步悔棋邀請。");
    if (room.status !== "playing") throw new Error("只有進行中的棋局可提出悔棋。");
    if (bv.pendingUndo) throw new Error("目前已有待處理悔棋邀請。");
    if (!bv.lastUndoSnapshot || bv.lastUndoSnapshot.gameInstanceId !== bv.gameInstanceId) throw new Error("目前沒有可撤銷的上一個操作。");
    bv.pendingUndo = { id: crypto.randomUUID(), requesterId: member.id, requestedAt: Date.now(), targetRevision: bv.revision, gameInstanceId: bv.gameInstanceId };
    appendEvent(room, "undo_requested", publicActor(member), { requestId: bv.pendingUndo.id, targetRevision: bv.pendingUndo.targetRevision });
    await this.saveRoom(); await this.broadcastState();
  }

  async undoAccept(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (isQiguo(room)) throw new Error("七國象棋暫不提供悔棋。");
    const pending = bv.pendingUndo;
    if (!pending || pending.requesterId === member.id) throw new Error("沒有可由你接受的悔棋邀請。");
    if (!bv.lastUndoSnapshot || bv.lastUndoSnapshot.gameInstanceId !== bv.gameInstanceId) throw new Error("悔棋快照已失效。");
    appendEvent(room, "undo_accepted", publicActor(member), { requestId: pending.id });
    room.game = structuredClone(bv.lastUndoSnapshot.game);
    bv.clock = structuredClone(bv.lastUndoSnapshot.clock);
    bv.pendingUndo = null;
    bv.lastUndoSnapshot = null;
    appendEvent(room, "state_restored", publicActor(member), { game: structuredClone(room.game), clock: publicClock(bv.clock), restoredFromRevision: pending.targetRevision });
    await this.saveRoom(); await this.updateOfflineAlarm(); await this.broadcastState();
  }

  async undoReject(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (isQiguo(room)) throw new Error("七國象棋暫不提供悔棋。");
    const pending = bv.pendingUndo;
    if (!pending || pending.requesterId === member.id) throw new Error("沒有可由你拒絕的悔棋邀請。");
    bv.pendingUndo = null;
    appendEvent(room, "undo_rejected", publicActor(member), { requestId: pending.id });
    await this.saveRoom(); await this.broadcastState();
  }

  async rematchRequest(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    if (room.settings?.queueEnabled) throw new Error("排隊模式不使用重新對局邀請。");
    if (room.status !== "finished") throw new Error("只有已結束的單局可以提出重新對局。");
    if (bv.pendingRematch) return this.rematchAccept(member, msg);
    const requiredIds = (room.seats || []).filter(Boolean);
    bv.pendingRematch = { id: crypto.randomUUID(), requesterId: member.id, requestedAt: Date.now(), requiredIds, acceptedIds: [member.id] };
    appendEvent(room, "rematch_requested", publicActor(member), { requestId: bv.pendingRematch.id, requiredIds });
    await this.saveRoom(); await this.broadcastState();
  }

  async rematchAccept(member, msg) {
    const room = this.room, bv = ensureFeatureState(room);
    requireRevision(room, msg.revision); assertPlayer(room, member);
    const pending = bv.pendingRematch;
    if (!pending) throw new Error("目前沒有重新對局邀請。");
    pending.requiredIds = Array.isArray(pending.requiredIds) && pending.requiredIds.length ? pending.requiredIds : (room.seats || []).filter(Boolean);
    pending.acceptedIds = Array.isArray(pending.acceptedIds) ? pending.acceptedIds : [pending.requesterId].filter(Boolean);
    if (!pending.requiredIds.includes(member.id)) throw new Error("你目前不是此桌玩家。");
    if (!pending.acceptedIds.includes(member.id)) pending.acceptedIds.push(member.id);
    appendEvent(room, "rematch_accepted", publicActor(member), { requestId: pending.id, acceptedIds: [...pending.acceptedIds], requiredIds: [...pending.requiredIds] });
    const accepted = pending.requiredIds.every((id) => pending.acceptedIds.includes(id));
    if (!accepted) { await this.saveRoom(); await this.broadcastState(); return; }
    if (!isQiguo(room) && room.seats.length === 2) {
      [room.seats[0], room.seats[1]] = [room.seats[1], room.seats[0]];
      room.seats.forEach((id, seat) => { const m = memberById(room, id); if (m) m.side = sideFor(room.gameId, seat); });
    } else {
      for (const id of room.seats) { const m = memberById(room, id); if (m) { m.side = sideFor(room.gameId, room.seats.indexOf(id)); if (isQiguo(room)) m.countries = []; } }
    }
    room.status = "waiting";
    room.rematchVotes = [];
    room.opening = null;
    room.startedAt = null;
    room.endedAt = null;
    bv.pendingRematch = null;
    bv.pendingUndo = null;
    bv.lastUndoSnapshot = null;
    bv.clock = null;
    bv.gameStartedAt = null;
    resetReady(room, false);
    await this.saveRoom(); await this.updateOfflineAlarm(); await this.syncLobby(); await this.broadcastState();
  }

  async roomChatSettings(member, msg) {
    const room = this.room, bv = ensureFeatureState(room); requireRevision(room, msg.revision); assertOwner(room, member);
    if (msg.playerSlowMs != null) bv.playerChatSlowMs = clampSlow(msg.playerSlowMs);
    if (msg.spectatorSlowMs != null) bv.spectatorChatSlowMs = clampSlow(msg.spectatorSlowMs);
    await this.saveRoom(); await this.broadcastState();
  }

  async handleChat(token, text) {
    const room = this.room, auth = this.authToken(token); if (!auth) throw new Error("工作階段已失效。");
    await assertAccountAllowed(this.env, room, auth.member);
    await assertRoomChatAllowed(this.env, room, auth.member);
    const bv = ensureFeatureState(room), now = Date.now();
    if (!bv.chatRate) bv.chatRate = {};
    const rec = bv.chatRate[auth.member.id] || { lastAt: 0, recent: [] };
    const channelSlow = auth.member.role === "player" ? bv.playerChatSlowMs : bv.spectatorChatSlowMs;
    const minimum = Math.max(1000, channelSlow || 0);
    if (now - rec.lastAt < minimum) throw new Error("發言速度過快，請稍候。");
    rec.recent = rec.recent.filter((x) => now - x.at < 10_000);
    if (rec.recent.length >= 5) throw new Error("短時間訊息過多。");
    const clean = String(text || "").trim();
    if (rec.recent.filter((x) => x.text === clean).length >= 2) throw new Error("請勿重複洗版。");
    rec.lastAt = now; rec.recent.push({ at: now, text: clean }); bv.chatRate[auth.member.id] = rec;
    return super.handleChat(token, text);
  }

  async queueSettings(token, msg) {
    const auth=this.authToken(token); if(auth) await assertAccountAllowed(this.env,this.room,auth.member);
    if (ensureFeatureState(this.room).voiceEnabled && msg.enabled) throw new Error("語音房禁止排隊與觀戰。");
    return super.queueSettings(token, msg);
  }

  async voiceSignal(member, msg) {
    const room = this.room, bv = ensureFeatureState(room); assertPlayer(room, member);
    if (!bv.voiceEnabled || room.seats?.length !== 2 || isQiguo(room)) throw new Error("此房間不提供 1v1 P2P 語音。");
    const peer = otherPlayer(room, member); if (!peer) throw new Error("對手尚未入席。");
    const data = msg.data && typeof msg.data === "object" ? structuredClone(msg.data) : null;
    if (!data || JSON.stringify(data).length > 64 * 1024) throw new Error("語音 signaling 資料不合法。");
    this.sendToToken(peer.token, { type: "voice_signal", from: member.id, data });
  }

  async finishMatch(result) {
    const room = this.room; if (!room || room.status !== "playing") return;
    const bv = ensureFeatureState(room), now = Date.now();
    if (this._pendingMoveContext) {
      const ctx = this._pendingMoveContext;
      bv.clock = ctx.settledClock;
      bv.lastUndoSnapshot = ctx.snapshot;
      appendEvent(room, "move_applied", publicActor(ctx.member), { move: sanitizedMove(ctx.msg), gameAfter: structuredClone(room.game), clockAfter: publicClock(bv.clock), snapshotRevision: ctx.snapshot.revision }, ctx.at);
      this._pendingMoveContext = null;
    }
    if (bv.pendingUndo) {
      appendEvent(room, "undo_cancelled", null, { requestId: bv.pendingUndo.id, reason: "game_finished" }, now);
      bv.pendingUndo = null;
    }
    const adminTerminated = !!result?.adminTerminated;
    await super.finishMatch(result);
    if (adminTerminated && room.result) room.result.adminTerminated = true;
    cancelDeadline(bv, "clock");
    if (bv.clock) { bv.clock.activePlayer = null; bv.clock.clockDeadlineAt = null; }
    appendEvent(room, "game_finished", null, { result: structuredClone(room.result), gameAfter: structuredClone(room.game), clockAfter: publicClock(bv.clock) }, now);
    if (this.env.BOARDVERSE_DB) {
      try {
        const replay = await archiveReplay(this.env.BOARDVERSE_DB, room, room.result, now);
        this.broadcastEvent({ type: "replay_available", replayId: replay.id, url: `/replay/${encodeURIComponent(replay.rawToken)}`, publicUntil: replay.publicUntil });
      } catch (e) {
        this.broadcastEvent({ type: "archive_warning", message: "棋局已完成，但全域 Replay 封存暫時失敗。" });
      }
      try { await this.awardMembershipGp(room, room.result, now); }
      catch { this.broadcastEvent({ type: "membership_warning", message: "棋局已完成，但會員 GP 結算暫時失敗。" }); }
    }
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async awardMembershipGp(room, result, now) {
    const bv = ensureFeatureState(room), players = room.seats.map((id) => memberById(room, id)).filter(Boolean);
    const durationMs = Math.max(0, now - Number(bv.gameStartedAt || now));
    const adminTerminated = !!result?.adminTerminated;
    for (const p of players) {
      const userId = bv.memberUsers[p.id] || p.userId; if (!userId) continue;
      const opp = players.length === 2 ? players.find((x) => x.id !== p.id) : null;
      const opponentUserId = opp ? (bv.memberUsers[opp.id] || opp.userId || null) : null;
      let outcome = "draw";
      if (isQiguo(room) && result?.winnerMemberId) outcome = result.winnerMemberId === p.id ? "win" : "loss";
      else if (result?.winner) outcome = result.winner === p.side ? "win" : "loss";
      await awardGameGp(this.env.BOARDVERSE_DB, { userId, opponentUserId, outcome, finishedNormally: !adminTerminated, durationMs, now });
    }
  }

  async webSocketClose(ws, code, reason) {
    const token = (ws.deserializeAttachment() || {}).token || "";
    const member = memberByToken(this.room, token);
    await super.webSocketClose(ws, code, reason);
    if (member && !member.connected) {
      const bv = ensureFeatureState(this.room);
      appendEvent(this.room, "player_disconnected", publicActor(member), null);
      if (member.id === this.room.ownerId && bv.roomCodeType === "custom") {
        bv.ownerDisconnectedAt = Date.now(); bv.ownerGraceVersion = (Number(bv.ownerGraceVersion) || 0) + 1;
      }
      await this.saveRoom(); await this.broadcastState();
    }
  }

  async webSocketError(ws) {
    const token = (ws.deserializeAttachment() || {}).token || "";
    const member = memberByToken(this.room, token);
    await super.webSocketError(ws);
    if (member && !member.connected) {
      const bv = ensureFeatureState(this.room);
      appendEvent(this.room, "player_disconnected", publicActor(member), { reason: "socket_error" });
      if (member.id === this.room.ownerId && bv.roomCodeType === "custom") { bv.ownerDisconnectedAt = Date.now(); bv.ownerGraceVersion = (Number(bv.ownerGraceVersion) || 0) + 1; }
      await this.saveRoom(); await this.broadcastState();
    }
  }

  async alarm() {
    const room = await this.loadRoom();
    if (!room) { if (await this.ctx.storage.getAlarm() != null) await this.ctx.storage.deleteAlarm(); return; }
    this.reconcileOfflineForfeits();
    await this.updateOfflineAlarm();
    const bv = ensureFeatureState(room), now = Date.now();
    for (const deadline of dueDeadlines(bv, now)) {
      if (deadline.type === "clock_timeout") {
        if (room.status !== "playing" || !bv.clock || deadline.version !== bv.clock.revision || deadline.payload?.gameInstanceId !== bv.gameInstanceId || deadline.payload?.activePlayer !== bv.clock.activePlayer) { cancelDeadline(bv, deadline.key); continue; }
        const loser = room.seats.map((id) => memberById(room, id)).find((m) => m?.side === bv.clock.activePlayer);
        const winner = loser ? otherPlayer(room, loser) : null;
        appendEvent(room, "timeout", publicActor(loser), { clock: publicClock(bv.clock) }, now);
        await this.finishMatch({ winner: winner?.side || null, winnerMemberId: winner?.id || null, winnerName: winner?.name || null, loserMemberId: loser?.id || null, loserName: loser?.name || null, reason: `${loser?.name || "玩家"} 棋鐘超時` });
      } else if (deadline.type === "player_offline") {
        const member = memberById(room, deadline.payload?.memberId);
        if (room.status !== "playing" || !member || member.connected || member.offlineMatchSeq !== deadline.payload?.matchSeq || Number(member.offlineDeadline) > now) { cancelDeadline(bv, deadline.key); continue; }
        if (this.hasSocketForToken(member.token)) { member.connected = true; this.clearOfflineForfeit(member); cancelDeadline(bv, deadline.key); continue; }
        if (isQiguo(room)) {
          cancelDeadline(bv, deadline.key);
          await super.alarm();
          await this.updateOfflineAlarm();
          return;
        }
        const winner = otherPlayer(room, member);
        await this.finishMatch({ winner: winner?.side || null, winnerMemberId: winner?.id || null, winnerName: winner?.name || null, loserMemberId: member.id, loserName: member.name, reason: `${member.name} 離線超過 60 秒，自動認輸` });
      } else if (deadline.type === "owner_grace") {
        const owner = memberById(room, room.ownerId);
        if (bv.roomCodeType !== "custom" || !owner || owner.connected || deadline.version !== bv.ownerGraceVersion) { cancelDeadline(bv, deadline.key); continue; }
        await this.closeRoomInternal("自訂房號房主離線保留時間已到期。", "system");
      }
    }
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async adminTerminateGame(request) {
    await this.loadRoom(); const body = await request.json().catch(() => ({}));
    if (this.room?.status === "playing") {
      appendEvent(this.room, "admin_game_terminated", { admin: true }, { reason: String(body.reason || "管理員終止") });
      await this.finishMatch({ winner: null, reason: `管理員終止：${String(body.reason || "未提供原因")}`, adminTerminated: true });
    }
    return json({ ok: true });
  }

  async adminCloseRoom(request) {
    await this.loadRoom(); const body = await request.json().catch(() => ({}));
    await this.closeRoomInternal(String(body.reason || "管理員關閉房間"), "admin");
    return json({ ok: true });
  }

  async closeRoomInternal(reason, actor) {
    const room = this.room; if (!room) return;
    if (room.status === "playing") {
      appendEvent(room, "admin_game_terminated", { admin: actor === "admin" }, { reason });
      await this.finishMatch({ winner: null, reason: `管理員終止／無結果：${reason}`, adminTerminated: true });
    }
    const bv = ensureFeatureState(room); bv.closed = true; room.status = "finished"; room.privateRoom = true;
    appendEvent(room, "room_closed", { admin: actor === "admin" }, { reason });
    cancelDeadline(bv, "clock"); cancelDeadline(bv, "owner-grace");
    this.broadcastEvent({ type: "session_end", message: `房間已關閉：${reason}` });
    for (const socket of this.ctx.getWebSockets()) try { socket.close(4002, "room closed"); } catch {}
    await this.saveRoom(); await this.syncLobby();
  }
}

function sanitizedMove(msg) {
  const out = { type: msg.type };
  for (const k of ["action", "r", "c", "from", "to", "promotion"]) if (msg[k] != null) out[k] = msg[k];
  return out;
}
