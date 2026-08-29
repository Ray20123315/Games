import app, { GameRoom as AppGameRoom, GlobalChat as AppGlobalChat } from "./index.js";
import { APP_VERSION } from "./core/config.js";
import { withDatabaseEnv } from "./core/db.js";
import { sessionUser } from "./auth/sessions.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { errorJson, json } from "./core/http.js";
import { BoardVerseDb as AppBoardVerseDb } from "./db/BoardVerseDb.js";
import { hardenPieceThemeHtml } from "./ui/piece-theme.js";
import { SITE_I18N_SCRIPT } from "./ui/site-i18n.js";
import { FEATURE_POLICY_SCRIPT } from "./ui/feature-policy.js";
import { injectAdminLevelPanel } from "./admin/level-ui.js";

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
      // A seated waiting player may ready before the opponent arrives. The
      // server still starts only after both seats exist and all players ready.
      feature.canReady = feature.myRole === "player" && feature.status === "waiting";
      feature.canVoice = !!feature.canVoice && !!feature.myUserId;
      feature.voiceLoginRequired = !!feature.voiceEnabled && feature.myRole === "player" && !feature.myUserId;
      next = { ...message, feature };
    }
    return super.send(ws, next);
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

function injectPublicNav(source, pathname) {
  if (pathname !== "/" || source.includes('id="bvPublicNav"')) return source;
  const nav = `<nav id="bvPublicNav" aria-label="BoardVerse" style="position:fixed;z-index:9999;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:rgba(18,20,26,.92);backdrop-filter:blur(10px);box-shadow:0 8px 28px rgba(0,0,0,.25);font:600 14px/1.2 system-ui,sans-serif"><span style="opacity:.72;margin-right:2px">v${APP_VERSION}</span><a href="/login" style="color:#fff;text-decoration:none;padding:6px 8px">登入</a><a href="/register" style="color:#fff;text-decoration:none;padding:6px 8px">註冊</a><a href="/report" style="color:#fff;text-decoration:none;padding:6px 8px">回報</a><a href="/admin" style="color:#fff;text-decoration:none;padding:6px 8px">管理</a></nav>`;
  return source.replace(/<body([^>]*)>/i, (match) => `${match}${nav}`);
}

function injectSiteScripts(source) {
  let scripts = "";
  if (!source.includes('id="boardverse-site-i18n"')) scripts += SITE_I18N_SCRIPT;
  if (!source.includes('id="boardverse-feature-policy"')) scripts += FEATURE_POLICY_SCRIPT;
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
    const withAdminLevel = injectAdminLevelPanel(await response.text(), requestUrl.pathname);
    const localized = injectSiteScripts(injectPublicNav(withAdminLevel, requestUrl.pathname));
    const body = hardenPieceThemeHtml(localized);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, withDatabaseEnv(env), ctx);
  },
};
