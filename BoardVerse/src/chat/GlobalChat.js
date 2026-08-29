import { DurableObject } from "cloudflare:workers";
import { MAX_CHAT_TEXT } from "../core/config.js";
import { verifySignedPayload } from "../core/crypto.js";
import { setting } from "../core/db.js";
import { errorJson, json } from "../core/http.js";

export class GlobalChat extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") return this.accept(request, url);
    if (url.pathname === "/admin/broadcast" && request.method === "POST") {
      const data = await request.json(); this.broadcast(data); return json({ ok: true });
    }
    if (url.pathname === "/admin/delete" && request.method === "POST") {
      const data = await request.json(); const id=String(data.id||"");
      const messages=(await this.ctx.storage.get("messages"))||[]; const next=messages.filter((m)=>m.id!==id);
      if(next.length!==messages.length){await this.ctx.storage.put("messages",next);this.broadcast({type:"global_deleted",id});}
      return json({ok:true,deleted:messages.length-next.length});
    }
    if (url.pathname === "/admin/clear" && request.method === "POST") {
      await this.ctx.storage.put("messages",[]); this.broadcast({type:"global_cleared"}); return json({ok:true});
    }
    if (url.pathname === "/admin/state" && request.method === "GET") {
      return json({ok:true,messages:(await this.ctx.storage.get("messages"))||[],connections:this.ctx.getWebSockets().length});
    }
    return errorJson("Global Chat route not found", 404, "not_found");
  }
  async accept(request, url) {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return errorJson("需要 WebSocket Upgrade。", 426, "upgrade_required");
    const identity = await verifySignedPayload(this.env.ADMIN_SESSION_SECRET || "", url.searchParams.get("identity") || "");
    if (!identity || Number(identity.exp) < Date.now()) return errorJson("聊天身份無效。", 401, "invalid_identity");
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server); server.serializeAttachment({ identity, lastAt: 0, recent: [] });
    const messages = (await this.ctx.storage.get("messages")) || [];
    server.send(JSON.stringify({ type: "global_history", messages }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 8 * 1024) return;
    let msg; try { msg = JSON.parse(message); } catch { return; }
    if (msg.type !== "chat") return;
    const a = ws.deserializeAttachment() || {}, identity = a.identity;
    const text = String(msg.text || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_CHAT_TEXT);
    if (!text) return;
    const now = Date.now();
    const hardMin = 1200;
    let slowMs = 5000;
    if (this.env.BOARDVERSE_DB) slowMs = Math.max(hardMin, Number(await setting(this.env.BOARDVERSE_DB, "global_chat_slow_ms", 5000)) || 5000);
    if (now - Number(a.lastAt || 0) < slowMs) { this.safeSend(ws, { type: "global_error", message: "發言速度過快，請稍候。" }); return; }
    const recent = Array.isArray(a.recent) ? a.recent.filter((x) => now - x.at < 10_000) : [];
    if (recent.length >= 5) { this.safeSend(ws, { type: "global_error", message: "短時間訊息過多。" }); return; }
    if (recent.filter((x) => x.text === text).length >= 2) { this.safeSend(ws, { type: "global_error", message: "請勿重複洗版。" }); return; }
    if (this.env.BOARDVERSE_DB) {
      const mute = await this.env.BOARDVERSE_DB.prepare("SELECT muted_until FROM chat_mutes WHERE subject_type=? AND subject_id=? AND channel='global'").bind(identity.kind, identity.id).first();
      if (Number(mute?.muted_until || 0) > now) { this.safeSend(ws, { type: "global_error", message: "你目前被禁止在全局聊天室發言。" }); return; }
      const enabled = await setting(this.env.BOARDVERSE_DB, "global_chat_enabled", true);
      if (enabled === false) { this.safeSend(ws, { type: "global_error", message: "全局聊天室目前暫停發言。" }); return; }
    }
    const entry = { id: crypto.randomUUID(), senderId: identity.id, senderKind: identity.kind, name: String(identity.name || "Guest").slice(0, 40), text, at: now };
    const messages = (await this.ctx.storage.get("messages")) || [];
    messages.push(entry); if (messages.length > 100) messages.splice(0, messages.length - 100);
    await this.ctx.storage.put("messages", messages);
    a.lastAt = now; a.recent = [...recent, { at: now, text }]; ws.serializeAttachment(a);
    this.broadcast({ type: "global_chat", message: entry });
  }
  safeSend(ws, payload) { try { ws.send(JSON.stringify(payload)); } catch {} }
  broadcast(payload) { for (const ws of this.ctx.getWebSockets()) this.safeSend(ws, payload); }
}
