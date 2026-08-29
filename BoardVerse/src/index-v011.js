import app, { GameRoom as AppGameRoom, GlobalChat as AppGlobalChat } from "./index.js";
import { APP_VERSION } from "./core/config.js";
import { withDatabaseEnv } from "./core/db.js";
import { sessionUser } from "./auth/sessions.js";
import { getUserMembership } from "./membership/membership.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { errorJson, json } from "./core/http.js";
import { BoardVerseDb as AppBoardVerseDb } from "./db/BoardVerseDb.js";
import { hardenPieceThemeHtml } from "./ui/piece-theme.js";
import { SITE_I18N_SCRIPT } from "./ui/site-i18n.js";
import { FEATURE_POLICY_SCRIPT } from "./ui/feature-policy.js";
import { computeDeadline, settleActive } from "./clock/clock-engine.js";
import { appendEvent, ensureFeatureState } from "./room/state.js";
import { cancelDeadline, nextDeadline } from "./room/deadline-scheduler.js";

const ADMIN_PAUSE_BLOCKED = new Set([
  "move", "pass", "swap_sides", "resign", "ready",
  "undo_request", "undo_accept", "undo_reject",
  "rematch", "rematch_request", "rematch_accept",
  "qiguo_choose", "opening_guess", "opening_choose", "opening_hand",
]);

const ADMIN_PAUSE_SCRIPT = `<script id="boardverse-admin-pause-notice">(function(){function sync(f){var id='bvAdminPauseNotice',n=document.getElementById(id);if(!f||!f.adminPaused){if(n)n.remove();return}if(!n){n=document.createElement('div');n.id=id;n.setAttribute('role','status');n.style.cssText='position:fixed;z-index:10000;left:50%;top:14px;transform:translateX(-50%);max-width:min(92vw,680px);padding:10px 16px;border:1px solid #d4af37;border-radius:999px;background:#15120b;color:#ffeaa2;box-shadow:0 10px 32px rgba(0,0,0,.38);font:800 14px/1.35 system-ui,sans-serif;text-align:center';document.body.appendChild(n)}n.textContent='此房間已由管理員暫停；棋鐘與遊戲操作已凍結，聊天室仍可使用。'}window.addEventListener('boardverse:feature',function(e){sync(e.detail)});setTimeout(function(){try{sync(window.BoardVerseBridge&&window.BoardVerseBridge.feature())}catch(e){}},0)})();</script>`;

function memberById(room, id) { return room?.members?.find((m) => m.id === id) || null; }

// Keep historical Durable Object class exports alive. Cloudflare already has a
// live SQLite namespace for GameRoom, so production reuses that namespace
// instead of provisioning another one. A distinct named GameRoom object
// ("primary") is used as the SQL persistence backend; its storage is isolated
// from every room object by Durable Object ID.
export class BoardVerseDb extends AppBoardVerseDb {}
export class BoardVerseDbV011 extends BoardVerseDb {}

export class GameRoom extends AppGameRoom {
  constructor(ctx, env) {
    const effectiveEnv = withDatabaseEnv(env);
    super(ctx, effectiveEnv);
    this.ctx = ctx;
    this.env = effectiveEnv;
  }

  query(mode, sql, binds = []) {
    const values = Array.isArray(binds) ? binds : [];
    const cursor = this.ctx.storage.sql.exec(String(sql || ""), ...values);
    const rows = cursor.toArray();
    const meta = {
      changes: Number(cursor.rowsWritten || 0),
      rows_read: Number(cursor.rowsRead || 0),
      rows_written: Number(cursor.rowsWritten || 0),
    };
    if (mode === "first") return rows[0] || null;
    if (mode === "all") return { success: true, results: rows, meta };
    if (mode === "run") return { success: true, meta };
    if (mode === "exec") return { success: true, meta };
    throw new Error(`Unsupported database query mode: ${mode}`);
  }

  send(ws, message) {
    let next = message;
    if (message?.type === "feature_state" && message.feature) {
      const feature = { ...message.feature };
      const bv = this.room ? ensureFeatureState(this.room) : null;
      feature.adminPaused = !!bv?.adminPaused;
      feature.adminPausedAt = bv?.adminPausedAt || null;
      // A seated waiting player may ready before the opponent arrives. The
      // server still starts only after both seats exist and all players ready.
      feature.canReady = !feature.adminPaused && feature.myRole === "player" && feature.status === "waiting";
      feature.canUndo = !feature.adminPaused && !!feature.canUndo;
      feature.canVoice = !!feature.canVoice && !!feature.myUserId;
      feature.voiceLoginRequired = !!feature.voiceEnabled && feature.myRole === "player" && !feature.myUserId;
      next = { ...message, feature };
    }
    return super.send(ws, next);
  }

  async roomInfo() {
    const response = await super.roomInfo();
    if (!response.ok) return response;
    const data = await response.json();
    const bv = this.room ? ensureFeatureState(this.room) : null;
    if (data?.room) {
      data.room.adminPaused = !!bv?.adminPaused;
      data.room.adminPausedAt = bv?.adminPausedAt || null;
    }
    return json(data);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/admin/state" && request.method === "GET") return this.adminState();
    if (url.pathname === "/admin/pause-room" && request.method === "POST") return this.adminPauseRoom(request);
    if (url.pathname === "/admin/resume-room" && request.method === "POST") return this.adminResumeRoom(request);
    return super.fetch(request);
  }

  async adminState() {
    const room = await this.loadRoom();
    if (!room) return errorJson("找不到此房間。", 404, "room_not_found");
    const bv = ensureFeatureState(room);
    return json({ ok: true, roomId: room.id, status: room.status, paused: !!bv.adminPaused, pausedAt: bv.adminPausedAt || null, closed: !!bv.closed });
  }

  async adminPauseRoom(request) {
    const room = await this.loadRoom();
    if (!room) return errorJson("找不到此房間。", 404, "room_not_found");
    const bv = ensureFeatureState(room);
    if (bv.closed) return errorJson("房間已關閉。", 410, "room_closed");
    if (bv.adminPaused) return json({ ok: true, paused: true, alreadyPaused: true });
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "管理員暫停房間").trim();
    const now = Date.now();

    if (room.status === "playing" && bv.clock?.activePlayer) {
      const settled = settleActive(bv.clock, now);
      if (settled.timedOut) return errorJson("棋鐘已超時，請先等待超時結算或直接終止此局。", 409, "clock_already_timed_out");
      bv.clock = settled.clock;
      bv.clock.turnStartedAt = now;
      bv.clock.clockDeadlineAt = null;
      bv.clock.revision = (Number(bv.clock.revision) || 0) + 1;
    }

    bv.adminPausedOffline = {};
    for (const member of room.members || []) {
      if (member.connected) continue;
      const deadline = Number(member.offlineDeadline);
      if (Number.isFinite(deadline) && deadline > now) bv.adminPausedOffline[member.id] = Math.max(1000, deadline - now);
    }
    const owner = memberById(room, room.ownerId);
    if (owner && !owner.connected && bv.ownerDisconnectedAt && bv.ownerGraceMs) {
      bv.adminPausedOwnerGraceMs = Math.max(1000, bv.ownerDisconnectedAt + bv.ownerGraceMs - now);
    } else bv.adminPausedOwnerGraceMs = null;

    bv.adminPaused = true;
    bv.adminPausedAt = now;
    appendEvent(room, "admin_room_paused", { admin: true }, { reason }, now);
    await this.saveRoom();
    await this.updateOfflineAlarm();
    await this.syncLobby();
    await this.broadcastState();
    return json({ ok: true, paused: true, pausedAt: now });
  }

  async adminResumeRoom(request) {
    const room = await this.loadRoom();
    if (!room) return errorJson("找不到此房間。", 404, "room_not_found");
    const bv = ensureFeatureState(room);
    if (bv.closed) return errorJson("房間已關閉。", 410, "room_closed");
    if (!bv.adminPaused) return json({ ok: true, paused: false, alreadyResumed: true });
    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "管理員恢復房間").trim();
    const now = Date.now();

    bv.adminPaused = false;
    bv.adminPausedAt = null;
    if (room.status === "playing" && bv.clock?.activePlayer) {
      bv.clock.turnStartedAt = now;
      bv.clock.revision = (Number(bv.clock.revision) || 0) + 1;
      bv.clock.clockDeadlineAt = computeDeadline(bv.clock);
    }
    for (const member of room.members || []) {
      if (member.connected) continue;
      const remaining = Number(bv.adminPausedOffline?.[member.id]);
      if (Number.isFinite(remaining) && remaining > 0) {
        member.offlineDeadline = now + remaining;
        member.offlineMatchSeq = member.offlineMatchSeq || room.matchSeq || 0;
      }
    }
    const owner = memberById(room, room.ownerId);
    const ownerRemaining = Number(bv.adminPausedOwnerGraceMs);
    if (owner && !owner.connected && Number.isFinite(ownerRemaining) && ownerRemaining > 0 && bv.ownerGraceMs) {
      bv.ownerDisconnectedAt = now + ownerRemaining - bv.ownerGraceMs;
    }
    bv.adminPausedOffline = null;
    bv.adminPausedOwnerGraceMs = null;
    appendEvent(room, "admin_room_resumed", { admin: true }, { reason }, now);
    await this.saveRoom();
    await this.updateOfflineAlarm();
    await this.syncLobby();
    await this.broadcastState();
    return json({ ok: true, paused: false, resumedAt: now });
  }

  async updateOfflineAlarm() {
    await super.updateOfflineAlarm();
    if (!this.room) return;
    const bv = ensureFeatureState(this.room);
    if (!bv.adminPaused) return;
    cancelDeadline(bv, "clock");
    cancelDeadline(bv, "owner-grace");
    for (const key of Object.keys(bv.deadlines || {})) if (key.startsWith("offline:")) cancelDeadline(bv, key);
    const next = nextDeadline(bv);
    const current = await this.ctx.storage.getAlarm();
    if (!next) {
      if (current != null) await this.ctx.storage.deleteAlarm();
    } else if (current == null || Math.abs(current - next.deadline) > 250) await this.ctx.storage.setAlarm(next.deadline);
  }

  async alarm() {
    const room = await this.loadRoom();
    if (room && ensureFeatureState(room).adminPaused) {
      if (await this.ctx.storage.getAlarm() != null) await this.ctx.storage.deleteAlarm();
      return;
    }
    return super.alarm();
  }

  async webSocketMessage(ws, message) {
    let type = "";
    try { type = JSON.parse(String(message || "")).type || ""; } catch {}
    await this.loadRoom();
    const bv = this.room ? ensureFeatureState(this.room) : null;
    if (bv?.adminPaused && ADMIN_PAUSE_BLOCKED.has(type)) {
      this.send(ws, { type: "error", code: "room_admin_paused", message: "此房間目前由管理員暫停，遊戲操作已凍結。" });
      this.sendFeatureState(ws);
      return;
    }
    return super.webSocketMessage(ws, message);
  }

  async voiceSignal(member, msg) {
    const bv = this.room?.bv;
    const userId = member ? (bv?.memberUsers?.[member.id] || member.userId || null) : null;
    if (!userId) {
      const error = new Error("語音功能僅供已登入帳號使用。");
      error.code = "voice_login_required";
      throw error;
    }
    return super.voiceSignal(member, msg);
  }
}
export class GameRoomV011 extends GameRoom {}

export class GlobalChat extends AppGlobalChat {
  constructor(ctx, env) {
    const effectiveEnv = withDatabaseEnv(env);
    super(ctx, effectiveEnv);
    this.env = effectiveEnv;
  }
}
export class GlobalChatV011 extends GlobalChat {}

function escapeNavText(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
async function publicNavAccount(env, request) {
  if (!env?.BOARDVERSE_DB) return null;
  try {
    const user = await sessionUser(env.BOARDVERSE_DB, request);
    if (!user) return null;
    const membership = await getUserMembership(env.BOARDVERSE_DB, user.id);
    return { label: String(user.username_display || user.username || "Account") + " · Lv." + Number(membership?.level || 1) };
  } catch { return null; }
}
function injectPublicNav(source, pathname, account) {
  if (pathname !== "/" || source.includes('id="bvPublicNav"')) return source;
  const auth = account
    ? '<a id="bvPublicAccount" href="/account" style="color:#fff;text-decoration:none;padding:6px 8px;font-weight:800">' + escapeNavText(account.label) + '</a>'
    : '<a href="/login" style="color:#fff;text-decoration:none;padding:6px 8px">登入</a><a href="/register" style="color:#fff;text-decoration:none;padding:6px 8px">註冊</a>';
  const nav = '<nav id="bvPublicNav" aria-label="BoardVerse" style="position:fixed;z-index:9999;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:rgba(18,20,26,.92);backdrop-filter:blur(10px);box-shadow:0 8px 28px rgba(0,0,0,.25);font:600 14px/1.2 system-ui,sans-serif"><span style="opacity:.72;margin-right:2px">v' + APP_VERSION + '</span>' + auth + '<a href="/report" style="color:#fff;text-decoration:none;padding:6px 8px">回報</a><a href="/admin" style="color:#fff;text-decoration:none;padding:6px 8px">管理</a></nav>';
  return source.replace(/<body([^>]*)>/i, (match) => match + nav);
}

function injectSiteScripts(source) {
  let scripts = "";
  if (!source.includes('id="boardverse-site-i18n"')) scripts += SITE_I18N_SCRIPT;
  if (!source.includes('id="boardverse-feature-policy"')) scripts += FEATURE_POLICY_SCRIPT;
  if (!source.includes('id="boardverse-admin-pause-notice"')) scripts += ADMIN_PAUSE_SCRIPT;
  if (!scripts) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${scripts}</head>`);
  return scripts + source;
}

async function hasVoiceIdentity(env, request) {
  if (env?.BOARDVERSE_DB) {
    try { if (await sessionUser(env.BOARDVERSE_DB, request)) return true; } catch {}
  }
  try { if (await adminPlayerEntitlement(env, request)) return true; } catch {}
  return false;
}

async function roomVoiceEnabled(env, roomId) {
  if (!env?.ROOMS) return false;
  try {
    const response = await env.ROOMS.getByName(roomId).fetch("https://boardverse.internal/info");
    if (!response.ok) return false;
    const data = await response.json();
    return !!data?.room?.voiceEnabled;
  } catch { return false; }
}

async function voiceAccountGuard(request, env, pathname) {
  if (request.method !== "POST") return null;
  if (pathname === "/api/rooms") {
    const body = await request.clone().json().catch(() => ({}));
    if (body?.feature?.voiceEnabled && !(await hasVoiceIdentity(env, request))) {
      return errorJson("語音功能僅供已登入帳號使用，請先登入再建立語音房。", 401, "voice_login_required");
    }
    return null;
  }
  const match = pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(?:enter|join)$/);
  if (match && await roomVoiceEnabled(env, match[1]) && !(await hasVoiceIdentity(env, request))) {
    return errorJson("此房間啟用了語音，請先登入帳號再加入。", 401, "voice_login_required");
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/admin") {
      return Response.redirect(new URL("/admin/", requestUrl), 302);
    }
    const effectiveEnv = withDatabaseEnv(env);
    if (requestUrl.pathname === "/api/voice-entitlement" && request.method === "GET") {
      return json({ ok: true, allowed: await hasVoiceIdentity(effectiveEnv, request) });
    }
    const voiceGuard = await voiceAccountGuard(request, effectiveEnv, requestUrl.pathname);
    if (voiceGuard) return voiceGuard;
    const response = await app.fetch(request, effectiveEnv, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const navAccount = requestUrl.pathname === "/" ? await publicNavAccount(effectiveEnv, request) : null;
    const localized = injectSiteScripts(injectPublicNav(await response.text(), requestUrl.pathname, navAccount));
    const body = hardenPieceThemeHtml(localized);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, withDatabaseEnv(env), ctx);
  },
};
