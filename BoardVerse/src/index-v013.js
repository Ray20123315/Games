import appV012, { GameRoom as GameRoomBase } from "./index-v012.js";
import { withDatabaseEnv } from "./core/db.js";
import { sessionUser } from "./auth/sessions.js";
import { adminPlayerEntitlement } from "./admin/auth.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GlobalChat,
  GlobalChatV011,
} from "./index-v012.js";

const OFFLINE_FORFEIT_MS = 20_000;

async function authenticatedRoomIdentity(env, request) {
  const effectiveEnv = withDatabaseEnv(env);
  if (effectiveEnv?.BOARDVERSE_DB) {
    try {
      const user = await sessionUser(effectiveEnv.BOARDVERSE_DB, request);
      if (user) {
        return {
          kind: "user",
          name: String(user.username_display || user.username || "Member").trim(),
          userId: String(user.id),
        };
      }
    } catch {}
  }
  try {
    const admin = await adminPlayerEntitlement(effectiveEnv, request);
    if (admin?.user) {
      return {
        kind: "admin",
        name: String(admin.user).trim() || "Admin",
        userId: `admin:${String(admin.user)}`,
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

async function rewriteAuthenticatedRoomName(request, env) {
  const url = new URL(request.url);
  if (!isRoomIdentityPost(request, url.pathname)) return request;
  const identity = await authenticatedRoomIdentity(env, request);
  if (!identity?.name) return request;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return request;
  body.playerName = identity.name;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Request(request, { headers, body: JSON.stringify(body) });
}

const AUTHENTICATED_ROOM_NAME_SCRIPT = String.raw`<style id="boardverse-auth-room-name-style">
.bv-auth-room-name-field{display:none!important}.bv-auth-room-name-note{grid-column:1/-1;padding:9px 11px;border:1px solid var(--line,#3b3327);border-radius:10px;background:rgba(195,161,95,.08);color:var(--muted,#aa9e8b);font-size:12px}.bv-auth-room-name-note strong{color:var(--text,#f3ede2)}
</style><script id="boardverse-auth-room-name">(()=>{'use strict';
function tr(h,s,e){try{var l=localStorage.getItem('boardverseLang')||'zh-Hant';return l==='en'?e:l==='zh-Hans'?s:h}catch{return h}}
function applyName(input,name,context){if(!input)return;input.value=name;input.required=false;input.readOnly=true;var field=input.closest('.field');if(field)field.classList.add('bv-auth-room-name-field');var host=field&&field.parentElement;if(!host)return;var id='bvAuthRoomNameNote'+context;if(document.getElementById(id))return;var note=document.createElement('div');note.id=id;note.className='bv-auth-room-name-note';note.innerHTML=tr('已使用登入帳號名稱：','已使用登录账号名称：','Using signed-in account name: ')+'<strong></strong>';note.querySelector('strong').textContent=name;host.insertBefore(note,field||host.firstChild)}
async function sync(){try{var r=await fetch('/api/me',{credentials:'same-origin',headers:{accept:'application/json'}});if(!r.ok)return;var d=await r.json();var identity=d.identity||{};if(!identity.role||identity.role==='guest')return;var name=String((d.user&&d.user.username)||identity.name||'').trim();if(!name)return;applyName(document.getElementById('createName'),name,'Create');applyName(document.getElementById('gateName'),name,'Gate')}catch(e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
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

function injectAuthenticatedRoomUi(source) {
  let body = String(source || "").replace(/60s →/g, "20s →");
  if (body.includes('id="boardverse-auth-room-name"')) return body;
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${AUTHENTICATED_ROOM_NAME_SCRIPT}</body>`);
  return body + AUTHENTICATED_ROOM_NAME_SCRIPT;
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
    const rewritten = await rewriteAuthenticatedRoomName(request, env);
    const response = await appV012.fetch(rewritten, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const path = new URL(request.url).pathname;
    if (path.startsWith("/admin")) return response;
    let body = injectAuthenticatedRoomUi(await response.text());
    body = injectHostKickVisibility(body);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return appV012.scheduled(event, env, ctx);
  },
};
