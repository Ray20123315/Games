import appV018 from "./index-v018.js";
import {
  actionEmergencyRoom,
  cleanupEmergencyD1,
  createEmergencyRoom,
  emergencyGlobalIdentity,
  emergencyRoomInfo,
  enterEmergencyRoom,
  listEmergencyRooms,
  pollEmergencyGlobal,
  pollEmergencyRoom,
  postEmergencyGlobal,
} from "./emergency/d1-mode.js";

export * from "./index-v018.js";

const ROOM_RE = /^\/api\/rooms\/([A-Z2-9]{6})$/;
const ROOM_INFO_RE = /^\/api\/rooms\/([A-Z2-9]{6})\/info$/;
const ROOM_ENTER_RE = /^\/api\/rooms\/([A-Z2-9]{6})\/(enter|join)$/;
const EMERGENCY_POLL_RE = /^\/api\/emergency\/rooms\/([A-Z2-9]{6})\/poll$/;
const EMERGENCY_ACTION_RE = /^\/api\/emergency\/rooms\/([A-Z2-9]{6})\/action$/;

function emergencyEnabled(env) {
  if (!env?.BOARDVERSE_D1 || String(env.BOARDVERSE_EMERGENCY_D1 || "") !== "1") return false;
  const until = Date.parse(String(env.BOARDVERSE_EMERGENCY_UNTIL || ""));
  return !Number.isFinite(until) || Date.now() < until;
}

function noLegacyDbEnv(env) {
  const hidden = new Set(["BOARDVERSE_DB", "BOARDVERSE_DB_DO"]);
  return new Proxy(env || {}, {
    get(target, prop, receiver) {
      if (hidden.has(String(prop))) return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (hidden.has(String(prop))) return false;
      return Reflect.has(target, prop);
    },
  });
}

function emergencyJson(message, status = 503, code = "emergency_unavailable") {
  return new Response(JSON.stringify({ ok: false, error: code, code, message, emergency: true }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const EMERGENCY_CLIENT_SCRIPT = String.raw`<script id="boardverse-emergency-d1-client">
(function(){
'use strict';
if(window.__BOARDVERSE_EMERGENCY_D1__)return;
window.__BOARDVERSE_EMERGENCY_D1__=true;
var NativeFetch=window.fetch.bind(window),GLOBAL=/\/ws\/global(?:\?|$)/;
var ROOM_MUTATIONS=new Set(['move','pass','swap_sides','resign','ready','undo_request','undo_accept','undo_reject','rematch','rematch_request','rematch_accept','review_join','queue_move','queue_settings','room_chat_settings','host_kick','qiguo_choose','opening_guess','opening_choose','opening_hand']);
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function asUrl(v){try{return new URL(String(v),location.href)}catch(e){return null}}
function jsonFetch(url,opt){return NativeFetch(url,opt).then(function(r){return r.json().catch(function(){return{ok:false,message:'服務回應格式錯誤'}}).then(function(d){if(!r.ok)throw Object.assign(new Error(d.message||'操作失敗'),{code:d.code||d.error||'request_failed',data:d,status:r.status});return d})})}
function normalizeState(payload){if(!payload||payload.type!=='state'||!payload.room)return payload;var r=payload.room;try{if(r.players&&r.players.host){r.players.host.connected=true;r.players.host.offlineDeadline=null}if(r.players&&r.players.guest){r.players.guest.connected=true;r.players.guest.offlineDeadline=null}(r.playerList||[]).forEach(function(p){if(p){p.connected=true;p.offlineDeadline=null}})}catch(e){}return payload}
class EmergencyWebSocket extends EventTarget{
  constructor(url,protocols){super();this.url=String(url);this.protocol='';this.extensions='';this.binaryType='blob';this.bufferedAmount=0;this.readyState=EmergencyWebSocket.CONNECTING;this.onopen=null;this.onmessage=null;this.onerror=null;this.onclose=null;this._closed=false;this._revision=-1;this._feature=null;this._globalSeq=0;this._u=asUrl(url);this._room=(this._u&&this._u.pathname.match(/^\/ws\/([A-Z2-9]{6})$/)||[])[1]||null;this._token=this._u?this._u.searchParams.get('token')||'':'';this._identity=this._u?this._u.searchParams.get('identity')||'':'';setTimeout(this._open.bind(this),0)}
  _emit(type,event){try{this.dispatchEvent(event)}catch(e){}var h=this['on'+type];if(typeof h==='function')try{h.call(this,event)}catch(e){}}
  _message(payload){payload=normalizeState(payload);if(payload&&payload.type==='feature_state'){this._feature=payload.feature||null;try{window.dispatchEvent(new CustomEvent('boardverse:feature',{detail:this._feature}))}catch(e){}}if(payload&&payload.type==='voice_signal'){try{window.dispatchEvent(new CustomEvent('boardverse:voice',{detail:payload}))}catch(e){}}if(payload&&payload.type==='replay_available'){try{window.dispatchEvent(new CustomEvent('boardverse:replay',{detail:payload}))}catch(e){}}this._emit('message',new MessageEvent('message',{data:JSON.stringify(payload)}))}
  _fail(error){var ev=new Event('error');ev.message=error&&error.message||String(error||'Emergency connection error');this._emit('error',ev)}
  _open(){if(this._closed)return;this.readyState=EmergencyWebSocket.OPEN;this._emit('open',new Event('open'));if(this._room)this._roomLoop();else if(this._u&&GLOBAL.test(this._u.pathname))this._globalLoop(true);else{this._fail(new Error('Unsupported emergency WebSocket route'));this.close(1008,'unsupported')}}
  async _roomLoop(){while(!this._closed){try{var d=await jsonFetch('/api/emergency/rooms/'+encodeURIComponent(this._room)+'/poll?token='+encodeURIComponent(this._token)+'&since='+encodeURIComponent(String(this._revision)));if(Number.isFinite(Number(d.revision)))this._revision=Number(d.revision);(d.messages||[]).forEach(this._message.bind(this))}catch(e){if(e&&e.code==='room_not_found'){this._message({type:'session_end',message:'原本的 Durable Object 房間目前無法讀取；已退出舊房間，請建立或加入新的緊急 D1 房間。'});this.close(1000,'stale room');return}this._fail(e);await sleep(1200)}}}
  async _globalLoop(initial){var first=!!initial;while(!this._closed){try{var path='/api/emergency/global/poll?since='+encodeURIComponent(String(this._globalSeq))+(first?'&initial=1':'');var d=await jsonFetch(path);first=false;if(d.initial)this._message({type:'global_history',messages:d.messages||[]});else(d.messages||[]).forEach(function(m){this._message({type:'global_chat',message:m})},this);if(Number.isFinite(Number(d.lastSeq)))this._globalSeq=Number(d.lastSeq)}catch(e){first=false;this._fail(e);await sleep(1200)}}}
  send(data){if(this.readyState!==EmergencyWebSocket.OPEN)throw new DOMException('WebSocket is not open','InvalidStateError');var msg;try{msg=JSON.parse(String(data))}catch(e){this._fail(e);return}if(this._room){if(ROOM_MUTATIONS.has(msg.type)&&this._feature&&Number.isInteger(this._feature.revision)&&!Number.isInteger(msg.revision))msg.revision=this._feature.revision;jsonFetch('/api/emergency/rooms/'+encodeURIComponent(this._room)+'/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:this._token,message:msg})}).then(function(d){if(Number.isFinite(Number(d.revision)))this._revision=Number(d.revision);(d.messages||[]).forEach(this._message.bind(this))}.bind(this)).catch(function(e){this._message({type:'error',message:e.message||'操作失敗'});if(e.code==='state_changed')this._revision=-1}.bind(this));return}if(this._u&&GLOBAL.test(this._u.pathname)){if(msg.type!=='chat')return;jsonFetch('/api/emergency/global/message',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identity:this._identity,text:msg.text})}).then(function(d){var m=d.message;if(m){if(Number.isFinite(Number(m.seq)))this._globalSeq=Math.max(this._globalSeq,Number(m.seq));this._message({type:'global_chat',message:m})}}.bind(this)).catch(function(e){this._message({type:'global_error',message:e.message||'聊天傳送失敗'})}.bind(this));return}}
  close(code,reason){if(this._closed)return;this._closed=true;this.readyState=EmergencyWebSocket.CLOSING;var ev=new CloseEvent('close',{code:Number(code)||1000,reason:String(reason||''),wasClean:true});this.readyState=EmergencyWebSocket.CLOSED;this._emit('close',ev)}
}
EmergencyWebSocket.CONNECTING=0;EmergencyWebSocket.OPEN=1;EmergencyWebSocket.CLOSING=2;EmergencyWebSocket.CLOSED=3;
window.WebSocket=EmergencyWebSocket;
window.boardverseBindingMissing=false;
})();
</script>`;

function emergencyBanner() {
  return `<div id="boardverse-emergency-d1-banner" role="status" style="position:relative;z-index:9999;margin:10px auto;max-width:1100px;padding:11px 15px;border:1px solid #c9a54b;border-radius:12px;background:#211b0f;color:#fff1b7;font:800 13px/1.55 system-ui,-apple-system,'Microsoft JhengHei',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22)">BoardVerse 緊急 D1 模式：可用訪客名稱建立新房間、加入、下棋、觀戰與文字聊天。今天原本存在 Durable Objects 裡的舊房間暫時無法讀取，請建立新的臨時房；帳號／會員資料會在額度重置後隨完整模式恢復。</div>`;
}

async function decorateEmergencyHtml(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let body = await response.text();
  if (!body.includes("boardverse-emergency-d1-client")) {
    if (/<head[^>]*>/i.test(body)) body = body.replace(/<head([^>]*)>/i, `<head$1>${EMERGENCY_CLIENT_SCRIPT}`);
    else body = `${EMERGENCY_CLIENT_SCRIPT}${body}`;
  }
  if (!body.includes("boardverse-emergency-d1-banner")) {
    const banner = emergencyBanner();
    if (/<body[^>]*>/i.test(body)) body = body.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
    else body = `${banner}${body}`;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-emergency", "d1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function emergencyRoute(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
  let m;
  if (path === "/api/rooms" && method === "GET") return listEmergencyRooms(env.BOARDVERSE_D1);
  if (path === "/api/rooms" && method === "POST") return createEmergencyRoom(env.BOARDVERSE_D1, request);
  m = path.match(ROOM_INFO_RE); if (m && method === "GET") return emergencyRoomInfo(env.BOARDVERSE_D1, m[1]);
  m = path.match(ROOM_ENTER_RE); if (m && method === "POST") return enterEmergencyRoom(env.BOARDVERSE_D1, m[1], request);
  m = path.match(EMERGENCY_POLL_RE); if (m && method === "GET") return pollEmergencyRoom(env.BOARDVERSE_D1, m[1], request.url);
  m = path.match(EMERGENCY_ACTION_RE); if (m && method === "POST") return actionEmergencyRoom(env.BOARDVERSE_D1, m[1], request);
  if (path === "/api/global-chat/identity" && method === "POST") return emergencyGlobalIdentity(env.BOARDVERSE_D1);
  if (path === "/api/emergency/global/poll" && method === "GET") return pollEmergencyGlobal(env.BOARDVERSE_D1, request.url);
  if (path === "/api/emergency/global/message" && method === "POST") return postEmergencyGlobal(env.BOARDVERSE_D1, request);
  if ((path === "/ws/global" || /^\/ws\/[A-Z2-9]{6}$/.test(path)) && method === "GET") {
    return emergencyJson("緊急模式改用 D1 長輪詢；請重新整理頁面。", 426, "emergency_polling_required");
  }
  if (ROOM_RE.test(path) && method === "GET") return null;
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (!emergencyEnabled(env)) return appV018.fetch(request, env, ctx);
    const routed = await emergencyRoute(request, env);
    if (routed) return routed;
    const response = await appV018.fetch(request, noLegacyDbEnv(env), ctx);
    return decorateEmergencyHtml(response);
  },
  async scheduled(event, env, ctx) {
    if (emergencyEnabled(env)) return cleanupEmergencyD1(env.BOARDVERSE_D1);
    return appV018.scheduled(event, env, ctx);
  },
};
