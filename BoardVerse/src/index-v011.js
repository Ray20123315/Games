import app, { GameRoom as AppGameRoom, GlobalChat as AppGlobalChat } from "./index.js";
import { APP_VERSION } from "./core/config.js";
import { withDatabaseEnv } from "./core/db.js";
import { BoardVerseDb as AppBoardVerseDb } from "./db/BoardVerseDb.js";
import { hardenPieceThemeHtml } from "./ui/piece-theme.js";

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
  const nav = `<nav id="bvPublicNav" aria-label="BoardVerse 功能入口" style="position:fixed;z-index:9999;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:rgba(18,20,26,.92);backdrop-filter:blur(10px);box-shadow:0 8px 28px rgba(0,0,0,.25);font:600 14px/1.2 system-ui,sans-serif"><span style="opacity:.72;margin-right:2px">v${APP_VERSION}</span><a href="/login" style="color:#fff;text-decoration:none;padding:6px 8px">登入</a><a href="/register" style="color:#fff;text-decoration:none;padding:6px 8px">註冊</a><a href="/report" style="color:#fff;text-decoration:none;padding:6px 8px">回報</a><a href="/admin" style="color:#fff;text-decoration:none;padding:6px 8px">管理</a></nav>`;
  return source.replace(/<body([^>]*)>/i, (match) => `${match}${nav}`);
}

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/admin") {
      return Response.redirect(new URL("/admin/", requestUrl), 302);
    }
    const effectiveEnv = withDatabaseEnv(env);
    const response = await app.fetch(request, effectiveEnv, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const body = hardenPieceThemeHtml(injectPublicNav(await response.text(), requestUrl.pathname));
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, withDatabaseEnv(env), ctx);
  },
};
