import appV012, { GameRoom as GameRoomBase } from "./index-v012.js";
import { withDatabaseEnv } from "./core/db.js";
import { errorJson, json } from "./core/http.js";
import { sessionUser } from "./auth/sessions.js";
import { publicAdminIdentity, publicIdentityForUser } from "./auth/identity.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { getUserMembership } from "./membership/membership.js";
import { ensureFeatureState } from "./room/state.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GlobalChat,
  GlobalChatV011,
} from "./index-v012.js";

const OFFLINE_FORFEIT_MS = 20_000;

function cleanIdentityName(value, fallback = "Player") {
  return String(value || fallback).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || fallback;
}

function sanitizePublicIdentity(value, fallbackName = "Player") {
  const role = ["owner", "admin", "member", "guest"].includes(value?.role) ? value.role : "guest";
  const name = cleanIdentityName(value?.name, fallbackName);
  if (role === "owner") return { role, badge: "OWNER", level: null, name };
  if (role === "admin") return { role, badge: "ADMIN", level: null, name };
  if (role === "member") {
    const level = Math.max(1, Math.min(999, Math.trunc(Number(value?.level) || 1)));
    return { role, badge: `Lv.${level}`, level, name };
  }
  return { role: "guest", badge: "訪客", level: null, name };
}

async function authenticatedRoomIdentity(env, request) {
  const effectiveEnv = withDatabaseEnv(env);
  if (effectiveEnv?.BOARDVERSE_DB) {
    try {
      const user = await sessionUser(effectiveEnv.BOARDVERSE_DB, request);
      if (user) {
        const membership = await getUserMembership(effectiveEnv.BOARDVERSE_DB, user.id).catch(() => null);
        const identity = sanitizePublicIdentity(publicIdentityForUser(user, membership), user.username_display || user.username || "Member");
        return {
          kind: "user",
          name: identity.name,
          userId: String(user.id),
          identity,
        };
      }
    } catch {}
  }
  try {
    const admin = await adminPlayerEntitlement(effectiveEnv, request);
    if (admin?.user) {
      const identity = sanitizePublicIdentity(publicAdminIdentity(admin.user), admin.user || "Admin");
      return {
        kind: "admin",
        name: identity.name,
        userId: `admin:${String(admin.user)}`,
        identity,
      };
    }
  } catch {}
  return null;
}

function isRoomIdentityPost(request, pathname) {
  if (request.method !== "POST") return false;
  if (pathname === "/api/rooms") return true;
  return /^\/api\/rooms\/[A-Z2-9]{6}\/(?:enter|join)$/.test(pathname);
}

function roomSocketMatch(request, pathname) {
  if (request.method !== "GET") return null;
  return pathname.match(/^\/ws\/([A-Z2-9]{6})$/);
}

async function rewriteAuthenticatedRoomName(request, identity) {
  const url = new URL(request.url);
  if (!identity?.name || !isRoomIdentityPost(request, url.pathname)) return request;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return request;
  body.playerName = identity.name;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Request(request, { headers, body: JSON.stringify(body) });
}

async function attachRoomIdentity(env, roomId, token, resolved) {
  const cleanRoomId = String(roomId || "").trim().toUpperCase();
  const cleanToken = String(token || "").trim();
  if (!env?.ROOMS || !/^[A-Z2-9]{6}$/.test(cleanRoomId) || !cleanToken || !resolved?.identity) return false;
  const response = await env.ROOMS.getByName(cleanRoomId).fetch(new Request("https://boardverse.internal/feature/attach-identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: cleanToken, userId: resolved.userId || null, identity: resolved.identity }),
  }));
  return response.ok;
}

async function attachIdentityFromJsonResponse(request, response, env, resolved) {
  if (!resolved?.identity || !response?.ok || !isRoomIdentityPost(request, new URL(request.url).pathname)) return;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== "object") return;
  const path = new URL(request.url).pathname;
  const enterMatch = path.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(?:enter|join)$/);
  const roomId = enterMatch?.[1] || data.roomId || data.room?.id || data.lobby?.id || null;
  const token = data.token || data.sessionToken || null;
  await attachRoomIdentity(env, roomId, token, resolved).catch(() => {});
}

const AUTHENTICATED_ROOM_NAME_SCRIPT = String.raw`<style id="boardverse-auth-room-name-style">
.bv-auth-room-name-field{display:none!important}.bv-auth-room-name-note{grid-column:1/-1;padding:9px 11px;border:1px solid var(--line,#3b3327);border-radius:10px;background:rgba(195,161,95,.08);color:var(--muted,#aa9e8b);font-size:12px}.bv-auth-room-name-note strong{color:var(--text,#f3ede2)}
</style><script id="boardverse-auth-room-name">(()=>{'use strict';
function tr(h,s,e){try{var l=localStorage.getItem('boardverseLang')||'zh-Hant';return l==='en'?e:l==='zh-Hans'?s:h}catch{return h}}
function applyName(input,name,context){if(!input)return;input.value=name;input.required=false;input.readOnly=true;var field=input.closest('.field');if(field)field.classList.add('bv-auth-room-name-field');var host=field&&field.parentElement;if(!host)return;var id='bvAuthRoomNameNote'+context;if(document.getElementById(id))return;var note=document.createElement('div');note.id=id;note.className='bv-auth-room-name-note';note.innerHTML=tr('已使用登入帳號名稱：','已使用登录账号名称：','Using signed-in account name: ')+'<strong></strong>';note.querySelector('strong').textContent=name;host.insertBefore(note,field||host.firstChild)}
async function sync(){try{var r=await fetch('/api/me',{credentials:'same-origin',headers:{accept:'application/json'}});if(!r.ok)return;var d=await r.json();var identity=d.identity||{};if(!identity.role||identity.role==='guest')return;var name=String((d.user&&d.user.username)||identity.name||'').trim();if(!name)return;applyName(document.getElementById('createName'),name,'Create');applyName(document.getElementById('gateName'),name,'Gate')}catch(e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();</script>`;

const ROOM_PUBLIC_IDENTITY_STYLE = String.raw`<style id="boardverse-room-public-identity-style">
#players .bv-room-identity-chip{position:relative;isolation:isolate;display:inline-flex;align-items:center;min-height:26px;max-width:100%;padding:0 9px;overflow:hidden;border:1px solid rgba(160,150,130,.55);border-radius:999px;background:rgba(110,100,82,.16);color:inherit;font:900 12px/1 system-ui,-apple-system,"Microsoft JhengHei",sans-serif;letter-spacing:.02em;white-space:nowrap;text-overflow:ellipsis}
#players .bv-room-id-member{border-color:rgba(109,153,199,.62);background:rgba(64,110,155,.16);color:#beddff}
#players .bv-room-id-guest{border-color:rgba(150,150,150,.42);background:rgba(120,120,120,.12);color:#c9c9c9}
#players .bv-room-id-admin{border-color:#b78555;background:linear-gradient(135deg,rgba(101,52,20,.92),rgba(180,108,55,.42));color:#f2c79d;box-shadow:0 0 12px rgba(183,133,85,.2)}
#players .bv-room-id-owner{border-color:#ffe68a;background:linear-gradient(135deg,#5c4200,#c99300 34%,#ffe98b 52%,#b77b00 70%,#f5ce4c);color:#1b1200;text-shadow:0 1px 0 rgba(255,255,255,.55);box-shadow:0 0 8px rgba(255,216,80,.45),0 0 22px rgba(212,175,55,.38);animation:bvRoomOwnerGlow 1.35s ease-in-out infinite alternate}
#players .bv-room-id-owner:after{content:"";position:absolute;z-index:1;inset:-50% auto -50% -60%;width:45%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.88),transparent);animation:bvRoomOwnerShine 2s linear infinite;pointer-events:none}
@keyframes bvRoomOwnerGlow{from{filter:brightness(.96);box-shadow:0 0 7px rgba(255,216,80,.36),0 0 16px rgba(212,175,55,.28)}to{filter:brightness(1.16);box-shadow:0 0 13px rgba(255,232,135,.82),0 0 34px rgba(212,175,55,.62)}}
@keyframes bvRoomOwnerShine{0%{left:-65%}45%,100%{left:155%}}
@media(prefers-reduced-motion:reduce){#players .bv-room-id-owner,#players .bv-room-id-owner:after{animation:none}}
</style>`;

const ROOM_PUBLIC_IDENTITY_SCRIPT = String.raw`<script id="boardverse-room-public-identity">(function(){
'use strict';
var feature=null;
function role(identity){return identity&&identity.role==='owner'?'owner':identity&&identity.role==='admin'?'admin':identity&&identity.role==='member'?'member':'guest'}
function decorate(){if(!feature||!Array.isArray(feature.roomIdentities))return;var cards=document.querySelectorAll('#players .player-card');if(!cards.length)return;cards.forEach(function(card,index){var row=feature.roomIdentities.find(function(x){return x&&x.seated&&Number(x.seat)===index}),strong=card.querySelector('strong');if(!row||!strong)return;var identity=row.identity||{role:'guest',badge:'訪客',name:row.name||''};var label=String(identity.badge||'訪客')+' · '+String(identity.name||row.name||'');var sig=role(identity)+'|'+label;if(strong.dataset.bvRoomIdentity===sig&&strong.querySelector('.bv-room-identity-chip'))return;strong.textContent='';strong.dataset.bvRoomIdentity=sig;var chip=document.createElement('span');chip.className='bv-room-identity-chip bv-room-id-'+role(identity);chip.textContent=label;strong.appendChild(chip)})}
window.addEventListener('boardverse:feature',function(e){feature=e.detail||null;requestAnimationFrame(decorate)});
var observer=new MutationObserver(function(){if(feature)decorate()});observer.observe(document.documentElement,{subtree:true,childList:true});
})();</script>`;

const HOST_KICK_VISIBILITY_STYLE = String.raw`<style id="boardverse-host-kick-visibility-style">
#bvHostKickPanel.bv-host-kick-card{display:block;margin:0;padding:13px;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--panel);box-shadow:var(--shadow)}
#bvHostKickPanel.bv-host-kick-card.hidden{display:none!important}
#bvHostKickPanel .bv-host-kick-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
#bvHostKickPanel .bv-host-kick-title strong{font-size:14px}
#bvHostKickPanel .queue-row{padding:8px 0}
#bvHostKickPanel .queue-row .btn{flex:0 0 auto;min-height:34px;padding:6px 10px}
</style>`;

const HOST_KICK_VISIBILITY_SCRIPT = String.raw`<script id="boardverse-host-kick-visibility">
(function(){
'use strict';
function relocate(){
  var panel=document.getElementById('bvHostKickPanel');
  var side=document.querySelector('.side-stack');
  if(!panel||!side)return;
  panel.classList.add('bv-host-kick-card');
  if(panel.parentNode!==side)side.insertBefore(panel,side.firstChild);
  var first=panel.firstElementChild;
  if(first&&first.tagName==='STRONG'&&!first.parentElement.classList.contains('bv-host-kick-title')){
    var head=document.createElement('div');head.className='bv-host-kick-title';panel.insertBefore(head,first);head.appendChild(first);
  }
}
var observer=new MutationObserver(relocate);
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('boardverse:feature',function(){setTimeout(relocate,0)});
relocate();
})();
</script>`;

const OWNER_INTERNAL_ACCOUNT_HTML = '<p><span data-bv-h="帳號" data-bv-s="账号" data-bv-e="Account">帳號</span>：<strong>OWNER</strong> · <span data-bv-h="內部管理帳號" data-bv-s="内部管理账号" data-bv-e="Internal admin account">內部管理帳號</span></p>';

function maskOwnerInternalEmail(source) {
  return String(source || "").replace(/<p>Email：admin-[^<\s]+@boardverse\.invalid<\/p>/gi, OWNER_INTERNAL_ACCOUNT_HTML);
}

function injectAuthenticatedRoomUi(source) {
  let body = String(source || "").replace(/60s →/g, "20s →");
  if (!body.includes('id="boardverse-auth-room-name"')) {
    if (/<\/body>/i.test(body)) body = body.replace(/<\/body>/i, `${AUTHENTICATED_ROOM_NAME_SCRIPT}</body>`);
    else body += AUTHENTICATED_ROOM_NAME_SCRIPT;
  }
  if (!body.includes('id="boardverse-room-public-identity-style"')) {
    if (/<\/head>/i.test(body)) body = body.replace(/<\/head>/i, `${ROOM_PUBLIC_IDENTITY_STYLE}</head>`);
    else body = ROOM_PUBLIC_IDENTITY_STYLE + body;
  }
  if (!body.includes('id="boardverse-room-public-identity"')) {
    if (/<\/body>/i.test(body)) body = body.replace(/<\/body>/i, `${ROOM_PUBLIC_IDENTITY_SCRIPT}</body>`);
    else body += ROOM_PUBLIC_IDENTITY_SCRIPT;
  }
  return body;
}

function injectHostKickVisibility(source) {
  let next = source;
  if (!next.includes('id="boardverse-host-kick-visibility-style"')) {
    if (/<\/head>/i.test(next)) next = next.replace(/<\/head>/i, `${HOST_KICK_VISIBILITY_STYLE}</head>`);
    else next = HOST_KICK_VISIBILITY_STYLE + next;
  }
  if (!next.includes('id="boardverse-host-kick-visibility"')) {
    if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${HOST_KICK_VISIBILITY_SCRIPT}</body>`);
    else next += HOST_KICK_VISIBILITY_SCRIPT;
  }
  return next;
}

export class GameRoom extends GameRoomBase {
  send(ws, message) {
    let next = message;
    if (message?.type === "feature_state" && message.feature && this.room) {
      const bv = ensureFeatureState(this.room);
      if (!bv.memberIdentities || typeof bv.memberIdentities !== "object") bv.memberIdentities = {};
      const roomIdentities = (this.room.members || []).map((member) => {
        const identity = sanitizePublicIdentity(bv.memberIdentities[member.id], member.name || "Player");
        const seat = Array.isArray(this.room.seats) ? this.room.seats.indexOf(member.id) : -1;
        return {
          memberId: member.id,
          name: member.name,
          role: member.role,
          seated: seat >= 0,
          seat,
          identity,
        };
      });
      next = { ...message, feature: { ...message.feature, roomIdentities } };
    }
    return super.send(ws, next);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/feature/attach-identity" && request.method === "POST") return this.attachRoomIdentity(request);
    return super.fetch(request);
  }

  async attachRoomIdentity(request) {
    const room = await this.loadRoom();
    if (!room) return errorJson("Room not found", 404, "room_not_found");
    const body = await request.json().catch(() => ({}));
    const token = String(body.token || "");
    const member = (room.members || []).find((item) => item.token === token) || null;
    if (!member) return errorJson("Member not found", 404, "member_not_found");
    const bv = ensureFeatureState(room);
    if (!bv.memberIdentities || typeof bv.memberIdentities !== "object") bv.memberIdentities = {};
    if (body.userId) {
      member.userId = String(body.userId);
      bv.memberUsers[member.id] = member.userId;
    }
    bv.memberIdentities[member.id] = sanitizePublicIdentity(body.identity, member.name || "Player");
    await this.saveRoom();
    await this.broadcastState();
    return json({ ok: true, memberId: member.id, identity: bv.memberIdentities[member.id] });
  }

  reconcileOfflineForfeits(now = Date.now()) {
    super.reconcileOfflineForfeits(now);
    const room = this.room;
    if (!room?.members) return;
    const activeMatchSeq = Number(room.matchSeq) || 0;
    const seated = new Set(Array.isArray(room.seats) ? room.seats.filter(Boolean) : []);
    for (const member of room.members) {
      const eligible = room.status === "playing" && member.role === "player" && seated.has(member.id) && !member.connected;
      if (!eligible) continue;
      const since = Number.isFinite(member.offlineSince) ? Number(member.offlineSince) : now;
      member.offlineSince = since;
      member.offlineDeadline = since + OFFLINE_FORFEIT_MS;
      member.offlineMatchSeq = activeMatchSeq;
    }
  }

  async finishMatch(result) {
    let next = result;
    if (result?.reason) {
      next = {
        ...result,
        reason: String(result.reason)
          .replace(/離線超過 60 秒/g, "離線超過 20 秒")
          .replace(/offline for more than 60 seconds/gi, "offline for more than 20 seconds"),
      };
    }
    return super.finishMatch(next);
  }
}

export class GameRoomV013 extends GameRoom {}

export default {
  async fetch(request, env, ctx) {
    const originalUrl = new URL(request.url);
    const socketMatch = roomSocketMatch(request, originalUrl.pathname);
    const needsIdentity = isRoomIdentityPost(request, originalUrl.pathname) || !!socketMatch;
    const identity = needsIdentity ? await authenticatedRoomIdentity(env, request) : null;

    if (socketMatch && identity) {
      await attachRoomIdentity(env, socketMatch[1], originalUrl.searchParams.get("token") || "", identity).catch(() => {});
    }

    const rewritten = await rewriteAuthenticatedRoomName(request, identity);
    const response = await appV012.fetch(rewritten, env, ctx);

    if (identity && isRoomIdentityPost(request, originalUrl.pathname)) {
      await attachIdentityFromJsonResponse(request, response, env, identity).catch(() => {});
    }

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const path = originalUrl.pathname;
    if (path.startsWith("/admin")) return response;
    let body = maskOwnerInternalEmail(await response.text());
    body = injectAuthenticatedRoomUi(body);
    body = injectHostKickVisibility(body);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return appV012.scheduled(event, env, ctx);
  },
};
