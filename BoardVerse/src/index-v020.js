import appV018 from "./index-v018.js";
import appV019 from "./index-v019.js";
import { sessionUser } from "./auth/sessions.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { publicAdminIdentity, publicIdentityForUser } from "./auth/identity.js";
import { getUserMembership } from "./membership/membership.js";
import { attachEmergencyRoomIdentity } from "./emergency/d1-identity.js";
import { injectModernUi } from "./ui/modern-ui.js";

export * from "./index-v019.js";

const GLOBAL_POLL_PATH = "/api/emergency/global/poll";
const EMERGENCY_ROOM_IDENTITY_RE = /^\/api\/rooms(?:\/[A-Z2-9]{6}\/(?:enter|join))?$/;
const EMERGENCY_ACCOUNT_RE = /^\/(?:login|logout|register|resend-verification|verify|forgot|reset|activate|account|report)(?:\/|$)/;
const EMERGENCY_ACCOUNT_API_RE = /^\/api\/(?:me|checkin|presets|resend-verification|announcements|voice-entitlement)(?:\/|$)/;

function emergencyEnabled(env) {
  if (!env?.BOARDVERSE_D1 || String(env.BOARDVERSE_EMERGENCY_D1 || "") !== "1") return false;
  const until = Date.parse(String(env.BOARDVERSE_EMERGENCY_UNTIL || ""));
  return !Number.isFinite(until) || Date.now() < until;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function emergencyAccountEnv(env) {
  return new Proxy(env || {}, {
    get(target, prop, receiver) {
      const key = String(prop);
      if (key === "BOARDVERSE_DB") return target.BOARDVERSE_D1;
      if (key === "BOARDVERSE_DB_DO") return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      const key = String(prop);
      if (key === "BOARDVERSE_DB") return !!target.BOARDVERSE_D1;
      if (key === "BOARDVERSE_DB_DO") return false;
      return Reflect.has(target, prop);
    },
  });
}

function isEmergencyAccountPath(pathname) {
  return EMERGENCY_ACCOUNT_RE.test(pathname)
    || EMERGENCY_ACCOUNT_API_RE.test(pathname)
    || pathname === "/admin"
    || pathname.startsWith("/admin/");
}

async function emergencyIdentity(env, request) {
  try {
    const user = await sessionUser(env.BOARDVERSE_D1, request);
    if (user) {
      const membership = await getUserMembership(env.BOARDVERSE_D1, user.id).catch(() => null);
      const identity = publicIdentityForUser(user, membership);
      return { userId: String(user.id), identity, name: identity.name || user.username_display || "Member" };
    }
  } catch {}
  try {
    const admin = await adminPlayerEntitlement(emergencyAccountEnv(env), request);
    if (admin?.user) {
      const identity = publicAdminIdentity(admin.user);
      return { userId: `admin:${String(admin.user)}`, identity, name: identity.name };
    }
  } catch {}
  return null;
}

async function prepareEmergencyRoomRequest(request, env) {
  if (request.method !== "POST" || !EMERGENCY_ROOM_IDENTITY_RE.test(new URL(request.url).pathname)) return { request, resolved: null };
  const resolved = await emergencyIdentity(env, request);
  if (!resolved?.name) return { request, resolved: null };
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return { request, resolved };
  body.playerName = String(resolved.name).normalize("NFKC").trim().slice(0, 40);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return { request: new Request(request, { headers, body: JSON.stringify(body) }), resolved };
}

async function attachIdentityFromEmergencyResponse(request, response, env, resolved) {
  if (!resolved?.identity || !response?.ok || request.method !== "POST") return;
  const path = new URL(request.url).pathname;
  if (!EMERGENCY_ROOM_IDENTITY_RE.test(path)) return;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== "object") return;
  const match = path.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(?:enter|join)$/);
  const roomId = match?.[1] || data.roomId || data.room?.id || data.lobby?.id || null;
  const token = data.token || data.sessionToken || null;
  await attachEmergencyRoomIdentity(env.BOARDVERSE_D1, roomId, token, resolved).catch(() => {});
}

async function pollEmergencyGlobalLite(db, requestUrl) {
  const url = new URL(requestUrl);
  const since = Math.max(0, Number(url.searchParams.get("since") || 0));
  const initial = url.searchParams.get("initial") === "1";
  if (initial) {
    const result = await db.prepare("SELECT seq,id,sender_name,message_text,created_at FROM emergency_global_chat ORDER BY seq DESC LIMIT 100").all();
    const rows = (result?.results || []).slice().reverse();
    return json({ ok: true, initial: true, lastSeq: Number(rows.at(-1)?.seq || 0), messages: rows.map((r) => ({ id:r.id,name:r.sender_name,text:r.message_text,at:Number(r.created_at),seq:Number(r.seq) })), emergency: true });
  }
  const result = await db.prepare("SELECT seq,id,sender_name,message_text,created_at FROM emergency_global_chat WHERE seq>? ORDER BY seq ASC LIMIT 100").bind(since).all();
  const rows = result?.results || [];
  return json({ ok: true, initial: false, lastSeq: Number(rows.at(-1)?.seq || since), messages: rows.map((r) => ({ id:r.id,name:r.sender_name,text:r.message_text,at:Number(r.created_at),seq:Number(r.seq) })), emergency: true });
}

const NOTICE_STYLE = `<style id="boardverse-emergency-notice-style">
#bvEmergencyNotice[hidden]{display:none!important}#bvEmergencyNotice{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.7);backdrop-filter:blur(7px)}#bvEmergencyNotice .bv-emergency-dialog{position:relative;width:min(560px,100%);max-height:min(82vh,680px);overflow:auto;border:1px solid #7b6435;border-radius:18px;background:linear-gradient(180deg,#1b1710,#100e0b);color:#f8f1df;box-shadow:0 28px 90px rgba(0,0,0,.55);padding:24px}#bvEmergencyNotice h2{margin:0 38px 12px 0;font-size:20px;line-height:1.35;color:#ffe89a}#bvEmergencyNotice p{margin:9px 0;color:#ddd2b7;font-size:14px;line-height:1.7}#bvEmergencyNotice .bv-emergency-ok{display:block;width:100%;margin-top:18px;border:1px solid #b18b32;border-radius:11px;background:linear-gradient(180deg,#d5ad45,#9a731d);color:#171108;font-weight:900;font-size:14px;padding:11px 14px;cursor:pointer}#bvEmergencyNotice .bv-emergency-close{position:absolute;right:14px;top:14px;width:34px;height:34px;border:1px solid #56482f;border-radius:10px;background:#17140f;color:#f4e7c3;font-size:18px;cursor:pointer}#bvEmergencyNotice .bv-emergency-today{display:flex;align-items:center;gap:9px;margin-top:15px;padding:11px 12px;border:1px solid #403722;border-radius:11px;background:#15120d;color:#eee2c4;font-size:13px;font-weight:800}#bvEmergencyNotice .bv-emergency-today input{width:17px;height:17px;accent-color:#c89b34}@media(max-width:560px){#bvEmergencyNotice{padding:12px}#bvEmergencyNotice .bv-emergency-dialog{padding:20px 16px}}
</style>`;
const NOTICE_HTML = `<div id="bvEmergencyNotice" role="dialog" aria-modal="true" aria-labelledby="bvEmergencyNoticeTitle" hidden><div class="bv-emergency-dialog"><button type="button" class="bv-emergency-close" aria-label="關閉">×</button><h2 id="bvEmergencyNoticeTitle">BoardVerse 服務模式調整</h2><p>Cloudflare Durable Objects 額度已用完，BoardVerse 已自動切換到<strong>緊急 D1 模式</strong>，不是整站停機。</p><p><strong>目前可用：</strong>建立新房間、加入、下棋、觀戰、文字聊天，以及 D1 帳號登入／註冊；ADMIN 可直接使用原本管理憑證登入。</p><p><strong>暫時受限：</strong>舊 Durable Object 房間，以及只存在舊 DB Durable Object、尚未遷移到 D1 的既有會員資料；P2P 語音與依賴 DO Alarm 的功能也暫時受限。</p><p>部分功能暫時受限，敬請見諒。開發者會持續監控服務狀態，並在資源恢復後自動切回完整模式。感謝各位的理解與支持，祝各位遊玩順利、對局愉快。</p><label class="bv-emergency-today"><input id="bvEmergencyNoticeToday" type="checkbox">今天不再顯示</label><button type="button" class="bv-emergency-ok">我知道了</button></div></div>`;
const NOTICE_SCRIPT = `<script id="boardverse-emergency-notice-script">(function(){'use strict';var root=document.getElementById('bvEmergencyNotice');if(!root)return;var check=document.getElementById('bvEmergencyNoticeToday'),ok=root.querySelector('.bv-emergency-ok'),close=root.querySelector('.bv-emergency-close');function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}var key='boardverseEmergencyNoticeDismissed';function hide(){try{if(check&&check.checked)localStorage.setItem(key,today())}catch(e){}root.hidden=true}try{if(localStorage.getItem(key)!==today()){root.hidden=false;setTimeout(function(){if(ok)ok.focus()},0)}}catch(e){root.hidden=false}if(ok)ok.addEventListener('click',hide);if(close)close.addEventListener('click',hide);root.addEventListener('click',function(e){if(e.target===root)hide()});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!root.hidden)hide()})})();</script>`;

const MOBILE_ROOM_STYLE = `<style id="boardverse-mobile-room-layout-fix">
@media(max-width:959px){body.room-mode{height:auto!important;min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important}body.room-mode .app-frame{height:auto!important;max-height:none!important;aspect-ratio:auto!important;overflow:visible!important;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))!important}body.room-mode .workspace,body.room-mode .room-layout,body.room-mode .room-main{height:auto!important;max-height:none!important;overflow:visible!important}body.room-mode .board-card{flex:0 0 auto!important;min-height:0!important;padding:6px!important}body.room-mode .board-stage{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding:6px!important;place-items:center!important}body.room-mode .board-fit{margin-inline:auto!important;max-width:100%!important;max-height:none!important}body.room-mode .banqi-board{aspect-ratio:2/1!important}body.room-mode .banqi-board .sq{aspect-ratio:auto!important;min-width:0!important;min-height:0!important}body.room-mode .side-stack{height:auto!important;max-height:none!important;overflow:visible!important;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))!important}body.room-mode .player-card,body.room-mode .player-card>div,body.room-mode .room-title,body.room-mode .status-card{min-width:0!important}body.room-mode .player-card strong,body.room-mode .player-card span,body.room-mode .room-title,body.room-mode .room-meta,body.room-mode .turn-banner,body.room-mode .role-line,body.room-mode .opening-box,body.room-mode .result-reason{white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important}}
@media(max-width:560px){body.room-mode .board-card{padding:4px!important}body.room-mode .board-stage{padding:3px!important}body.room-mode .banqi-board{border-width:4px!important}body.room-mode .banqi-back{font-size:clamp(13px,5cqw,22px)!important}body.room-mode .banqi-board .xq-piece{font-size:clamp(13px,5cqw,24px)!important}}
</style>`;

function stripOldNotices(body) { return body.replace(/<div id="boardverse-do-quota-notice"[\s\S]*?<\/div>/gi, "").replace(/<div id="boardverse-emergency-d1-banner"[\s\S]*?<\/div>/gi, ""); }
function patchHomeNavigation(body) { return body.replace("if(ready&&session&&session.roomId&&session.token&&(!code||session.roomId===code)){connectRoom()}", "if(ready&&code&&session&&session.roomId&&session.token&&session.roomId===code){connectRoom()}"); }
function patchEmergencyPolling(body) {
  body = body.replace("async _roomLoop(){while(!this._closed){try{var d=await jsonFetch('/api/emergency/rooms/'", "async _roomLoop(){while(!this._closed){try{if(document.visibilityState==='hidden')await sleep(15000);var d=await jsonFetch('/api/emergency/rooms/'");
  body = body.replace("async _globalLoop(initial){var first=!!initial;while(!this._closed){try{var path='/api/emergency/global/poll?since='", "async _globalLoop(initial){var first=!!initial;while(!this._closed){try{var card=document.getElementById('bvGlobalChat'),rect=card&&card.getBoundingClientRect();if(document.visibilityState==='hidden'||(rect&&(rect.bottom<0||rect.top>innerHeight*1.25))){await sleep(document.visibilityState==='hidden'?60000:20000);continue}var path='/api/emergency/global/poll?since='");
  body = body.replace("if(Number.isFinite(Number(d.lastSeq)))this._globalSeq=Number(d.lastSeq)}catch(e)", "if(Number.isFinite(Number(d.lastSeq)))this._globalSeq=Number(d.lastSeq);await sleep(10000)}catch(e)");
  body = body.replace("setInterval(function(){if($('lobby')&&!$('lobby').classList.contains('hidden'))refreshRooms()},12000);", "setInterval(function(){if($('lobby')&&!$('lobby').classList.contains('hidden'))refreshRooms()},45000);");
  return body;
}

async function improveHtml(response, forceEmergency = false) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let body = patchHomeNavigation(await response.text());
  if (!body.includes("boardverse-mobile-room-layout-fix")) body = body.replace(/<\/head>/i, `${MOBILE_ROOM_STYLE}</head>`);
  const emergency = !!forceEmergency || response.headers.get("x-boardverse-emergency") === "d1" || body.includes("boardverse-emergency-d1-client");
  if (emergency) {
    body = patchEmergencyPolling(stripOldNotices(body));
    if (!body.includes("boardverse-emergency-notice-style")) body = body.replace(/<\/head>/i, `${NOTICE_STYLE}</head>`);
    if (!body.includes('id="bvEmergencyNotice"')) body = body.replace(/<\/body>/i, `${NOTICE_HTML}${NOTICE_SCRIPT}</body>`);
  }
  body = injectModernUi(body);
  const headers = new Headers(response.headers);
  headers.delete("content-length"); headers.set("cache-control", "no-store");
  headers.set("x-boardverse-history-fix", "root-does-not-resume-room"); headers.set("x-boardverse-mobile-room-layout", "content-sized-board-stage"); headers.set("x-boardverse-ui", "modern-v2");
  if (emergency) headers.set("x-boardverse-emergency-notice", "modal");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), emergency = emergencyEnabled(env);
    if (emergency && url.pathname === GLOBAL_POLL_PATH && request.method === "GET") {
      try { return await pollEmergencyGlobalLite(env.BOARDVERSE_D1, request.url); } catch {}
    }
    if (emergency && isEmergencyAccountPath(url.pathname)) {
      const response = await appV018.fetch(request, emergencyAccountEnv(env), ctx);
      return improveHtml(response, true);
    }
    const prepared = emergency ? await prepareEmergencyRoomRequest(request, env) : { request, resolved: null };
    const response = await appV019.fetch(prepared.request, env, ctx);
    if (emergency && prepared.resolved) await attachIdentityFromEmergencyResponse(prepared.request, response, env, prepared.resolved);
    return improveHtml(response, emergency);
  },
  scheduled(event, env, ctx) { return appV019.scheduled(event, env, ctx); },
};
