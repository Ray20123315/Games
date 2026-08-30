import appV020 from "./index-v020.js";
import { FocusGuardGameRoom } from "./room/focus-guard-room.js";
import { actionEmergencyFocus, pollEmergencyRoomLean } from "./emergency/d1-focus-mode.js";

export * from "./index-v020.js";
export { FocusGuardGameRoom as GameRoom };

const EMERGENCY_ROOM_POLL_RE = /^\/api\/emergency\/rooms\/([A-Z2-9]{6})\/poll$/;
const EMERGENCY_ROOM_ACTION_RE = /^\/api\/emergency\/rooms\/([A-Z2-9]{6})\/action$/;
const FOCUS_REPORT_RE = /^\/api\/rooms\/([A-Z2-9]{6})\/focus$/;

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

function roomStub(namespace, roomId) {
  if (!namespace) return null;
  if (typeof namespace.getByName === "function") return namespace.getByName(roomId);
  if (typeof namespace.idFromName === "function" && typeof namespace.get === "function") return namespace.get(namespace.idFromName(roomId));
  return null;
}

async function handleFocusReport(request, env, roomId) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || ""), eventId = String(body.eventId || ""), cause = String(body.cause || "unknown");
  if (!token) return json({ ok: false, code: "session_invalid", message: "工作階段已失效。" }, 401);
  if (emergencyEnabled(env)) {
    return actionEmergencyFocus(env.BOARDVERSE_D1, roomId, new Request("https://boardverse.internal/focus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, message: { type: "focus_violation", eventId, cause } }),
    }));
  }
  const stub = roomStub(env?.ROOMS, roomId);
  if (!stub) return json({ ok: false, code: "room_binding_missing", message: "房間服務暫時不可用。" }, 503);
  return stub.fetch(new Request("https://boardverse.internal/feature/focus-violation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, eventId, cause }),
  }));
}

const FOCUS_STYLE = `<style id="boardverse-focus-guard-style">
#bvFocusGuardModal[hidden]{display:none!important}#bvFocusGuardModal{position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(7px)}#bvFocusGuardModal .bv-fg-card{width:min(520px,100%);max-height:min(86vh,680px);overflow:auto;border:1px solid #765f32;border-radius:18px;background:linear-gradient(180deg,#1b1710,#100e0b);color:#f7efd9;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.58)}#bvFocusGuardModal h3{margin:0 0 10px;color:#ffe89a;font-size:20px}#bvFocusGuardModal p{margin:8px 0;color:#d9cfb4;font-size:14px;line-height:1.7}#bvFocusGuardModal .bv-fg-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0;padding:12px;border:1px solid #403722;border-radius:11px;background:#15120d}#bvFocusGuardModal input[type=number]{width:88px;border:1px solid #5b4a2c;border-radius:9px;background:#0e0d0a;color:#fff;padding:9px}#bvFocusGuardModal input[type=checkbox]{width:18px;height:18px;accent-color:#c89b34}#bvFocusGuardModal .bv-fg-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}#bvFocusGuardModal button{border:1px solid #655333;border-radius:10px;background:#17140f;color:#f4e7c3;font-weight:800;padding:10px 14px;cursor:pointer}#bvFocusGuardModal .bv-fg-confirm{border-color:#b18b32;background:linear-gradient(180deg,#d5ad45,#9a731d);color:#171108}#bvFocusGuardStatus{font-size:12px;font-weight:800;color:#d9c17a}.bv-fg-danger{color:#ffb2a8!important}@media(max-width:560px){#bvFocusGuardModal{padding:10px}#bvFocusGuardModal .bv-fg-card{padding:18px 14px}.bv-fg-row{align-items:flex-start!important;flex-direction:column}}
</style>`;

const FOCUS_HTML = `<div id="bvFocusGuardModal" role="dialog" aria-modal="true" hidden><section class="bv-fg-card"><h3 id="bvFocusGuardTitle">防切頁規則</h3><div id="bvFocusGuardBody"></div><div class="bv-fg-actions"><button id="bvFocusGuardCancel" type="button">取消</button><button id="bvFocusGuardConfirm" class="bv-fg-confirm" type="button">確定</button></div></section></div>`;

const FOCUS_SCRIPT = String.raw`<script id="boardverse-focus-guard-client">
(function(){
'use strict';
if(window.__BOARDVERSE_FOCUS_GUARD__)return;window.__BOARDVERSE_FOCUS_GUARD__=true;
var feature=null,episode=null,lastViolation=0,lastGame='',modalAction=null;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function tx(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function $(id){return document.getElementById(id)}
function session(){try{return JSON.parse(localStorage.getItem('boardverseSession')||'null')}catch(e){return null}}
function modal(){return $('bvFocusGuardModal')}
function closeModal(){var root=modal();if(root)root.hidden=true;modalAction=null}
function showModal(title,html,confirmText,onConfirm,cancel){var root=modal();if(!root)return;$('bvFocusGuardTitle').textContent=title;$('bvFocusGuardBody').innerHTML=html;$('bvFocusGuardConfirm').textContent=confirmText||tx('確定','确定','OK');$('bvFocusGuardCancel').hidden=cancel===false;modalAction=typeof onConfirm==='function'?onConfirm:null;root.hidden=false;setTimeout(function(){$('bvFocusGuardConfirm').focus()},0)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function ruleText(){if(!feature)return tx('防切頁：讀取中','防切页：读取中','Focus guard: loading');if(!feature.focusGuardEnabled)return tx('防切頁：關閉','防切页：关闭','Focus guard: off');return tx('防切頁：開啟 · 允許 ','防切页：开启 · 允许 ','Focus guard: on · allow ')+Number(feature.focusGuardAllowedLeaves||0)+tx(' 次',' 次',' leave(s)')}
function mountButton(){var controls=$('bvFeatureControls');if(!controls||$('bvFocusGuardButton'))return;var status=document.createElement('span');status.id='bvFocusGuardStatus';controls.appendChild(status);var b=document.createElement('button');b.id='bvFocusGuardButton';b.type='button';b.className='btn ghost';b.textContent=tx('防切頁設定','防切页设置','Focus guard');b.addEventListener('click',function(){if(feature&&feature.canConfigureFocusGuard)openSettings();else openInfo()});controls.appendChild(b);renderStatus()}
function renderStatus(){var s=$('bvFocusGuardStatus');if(!s||!feature)return;s.textContent=ruleText()+(feature.myRole==='player'&&feature.focusGuardActive?tx(' · 已離開 ',' · 已离开 ',' · left ')+Number(feature.myFocusGuardViolations||0):'');var b=$('bvFocusGuardButton');if(b)b.textContent=feature.canConfigureFocusGuard?tx('設定防切頁','设置防切页','Configure focus guard'):tx('查看防切頁規則','查看防切页规则','View focus rule')}
function openInfo(){if(!feature)return;var allowed=Number(feature.focusGuardAllowedLeaves||0),used=Number(feature.myFocusGuardViolations||0);showModal(tx('防切頁規則','防切页规则','Focus guard rule'),'<p><strong>'+esc(ruleText())+'</strong></p><p>'+tx('對局開始後，切換分頁、切到其他 App、最小化、視窗失焦、重新整理或離開頁面，都會記錄一次離開。','对局开始后，切换分页、切到其他 App、最小化、窗口失焦、刷新或离开页面，都会记录一次离开。','After the match starts, changing tabs/apps, minimizing, losing focus, reloading, or leaving the page counts as leaving.')+'</p><p>'+tx('目前已記錄：','目前已记录：','Recorded: ')+used+' / '+allowed+'</p>',tx('我知道了','我知道了','Got it'),closeModal,false)}
function openSettings(){var enabled=feature.focusGuardEnabled!==false,allowed=Number(feature.focusGuardAllowedLeaves||0);showModal(tx('設定防切頁規則','设置防切页规则','Configure focus guard'),'<p>'+tx('設定只允許在對局開始前修改。修改後，所有已準備玩家會自動取消準備，必須重新確認規則。','设置只允许在对局开始前修改。修改后，所有已准备玩家会自动取消准备，必须重新确认规则。','Settings can only change before the match. Changing them clears Ready so everyone must confirm again.')+'</p><label class="bv-fg-row"><span><strong>'+tx('啟用防切頁模式','启用防切页模式','Enable focus guard')+'</strong><br><small>'+tx('預設開啟','默认开启','Enabled by default')+'</small></span><input id="bvFgEnabled" type="checkbox" '+(enabled?'checked':'')+'></label><label class="bv-fg-row"><span><strong>'+tx('允許離開次數','允许离开次数','Allowed leaves')+'</strong><br><small>'+tx('0 = 第一次離開就判負','0 = 第一次离开就判负','0 = first leave forfeits')+'</small></span><input id="bvFgAllowed" type="number" min="0" max="20" step="1" value="'+allowed+'"></label>',tx('套用規則','应用规则','Apply rule'),function(){var bridge=window.BoardVerseBridge;if(!bridge||!feature)return;bridge.send({type:'focus_guard_settings',enabled:!!$('bvFgEnabled').checked,allowedLeaves:Math.max(0,Math.min(20,Math.round(Number($('bvFgAllowed').value)||0))),revision:feature.revision});closeModal()},true)}
function confirmReady(){var allowed=Number(feature.focusGuardAllowedLeaves||0);showModal(tx('準備進入防切頁對局','准备进入防切页对局','Ready for focus-guard match'),'<p><strong>'+tx('本局已啟用防切頁模式。','本局已启用防切页模式。','Focus guard is enabled for this match.')+'</strong></p><p>'+tx('切換分頁、切 App、最小化、視窗失焦、重新整理或離開頁面都會記錄離開。允許離開 ','切换分页、切 App、最小化、窗口失焦、刷新或离开页面都会记录离开。允许离开 ','Switching tabs/apps, minimizing, losing focus, reloading, or leaving counts as leaving. Allowed leaves: ')+allowed+tx(' 次；超過後立即判負。',' 次；超过后立即判负。','; exceeding this immediately forfeits the match.')+'</p>',tx('了解並準備','了解并准备','Accept & Ready'),function(){closeModal();if(window.BoardVerseBridge)window.BoardVerseBridge.send({type:'ready',ready:true,revision:feature&&feature.revision})},true)}
function report(cause){if(!feature||!feature.focusGuardEnabled||!feature.focusGuardActive||feature.myRole!=='player'||feature.status!=='playing'||episode)return;var s=session();if(!s||!s.roomId||!s.token)return;episode=(window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2));var body=JSON.stringify({token:s.token,eventId:episode,cause:cause});var url='/api/rooms/'+encodeURIComponent(s.roomId)+'/focus';try{fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:body,keepalive:true,cache:'no-store'}).catch(function(){})}catch(e){try{if(navigator.sendBeacon)navigator.sendBeacon(url,new Blob([body],{type:'application/json'}))}catch(_){}}}
function checkLeave(cause,delay){setTimeout(function(){if(document.visibilityState==='hidden'||!document.hasFocus())report(cause)},delay||0)}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')checkLeave('visibility_hidden',0);else setTimeout(function(){if(document.visibilityState==='visible'&&document.hasFocus())episode=null},120)});window.addEventListener('blur',function(){checkLeave('window_blur',120)});window.addEventListener('focus',function(){setTimeout(function(){if(document.visibilityState==='visible'&&document.hasFocus())episode=null},120)});window.addEventListener('pagehide',function(){report('pagehide')});
document.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('#bvReady');if(!b||!feature||feature.myReady||!feature.canReady||!feature.focusGuardEnabled)return;e.preventDefault();e.stopImmediatePropagation();confirmReady()},true);
window.addEventListener('boardverse:feature',function(e){feature=e.detail||null;mountButton();renderStatus();if(!feature)return;var game=String(feature.gameInstanceId||'');var now=Number(feature.myFocusGuardViolations||0);if(game!==lastGame){lastGame=game;lastViolation=now;return}if(now>lastViolation){var allowed=Number(feature.focusGuardAllowedLeaves||0);if(now>allowed||feature.status==='finished'){showModal(tx('已因防切頁規則判負','已因防切页规则判负','Forfeit by focus guard'),'<p class="bv-fg-danger"><strong>'+tx('系統已記錄你離開比賽畫面，超過本局允許次數。','系统已记录你离开比赛画面，超过本局允许次数。','You left the game view more times than allowed.')+'</strong></p><p>'+tx('本局結果已由伺服器判定。','本局结果已由服务器判定。','The server has finalized the match result.')+'</p>',tx('確定','确定','OK'),closeModal,false)}else{showModal(tx('防切頁警告','防切页警告','Focus guard warning'),'<p><strong>'+tx('已記錄第 ','已记录第 ','Recorded leave #')+now+tx(' 次離開。',' 次离开。','.')+'</strong></p><p>'+tx('本局允許 ','本局允许 ','This match allows ')+allowed+tx(' 次；再次超過就會立即判負。',' 次；再次超过就会立即判负。',' leave(s); exceeding the limit forfeits immediately.')+'</p>',tx('繼續比賽','继续比赛','Continue'),closeModal,false)}}lastViolation=now});
function boot(){mountButton();var root=modal();if(root){$('bvFocusGuardCancel').addEventListener('click',closeModal);$('bvFocusGuardConfirm').addEventListener('click',function(){var fn=modalAction;if(fn)fn();else closeModal()});root.addEventListener('click',function(e){if(e.target===root)closeModal()})}new MutationObserver(mountButton).observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
</script>`;

function patchEmergencyRoomIdle(body) {
  return body.replace(
    "if(document.visibilityState==='hidden')await sleep(15000);var d=await jsonFetch('/api/emergency/rooms/'",
    "if(document.visibilityState==='hidden'||!document.hasFocus()){await sleep(30000);continue}var d=await jsonFetch('/api/emergency/rooms/'",
  );
}

async function decorateHtml(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  let body = await response.text();
  body = patchEmergencyRoomIdle(body);
  if (!body.includes("boardverse-focus-guard-style")) body = body.replace(/<\/head>/i, `${FOCUS_STYLE}</head>`);
  if (!body.includes('id="bvFocusGuardModal"')) body = body.replace(/<\/body>/i, `${FOCUS_HTML}${FOCUS_SCRIPT}</body>`);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-focus-guard", "server-enforced");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
    let match;
    if (emergencyEnabled(env) && method === "GET" && (match = path.match(EMERGENCY_ROOM_POLL_RE))) {
      return pollEmergencyRoomLean(env.BOARDVERSE_D1, match[1], request.url);
    }
    if (emergencyEnabled(env) && method === "POST" && (match = path.match(EMERGENCY_ROOM_ACTION_RE))) {
      return actionEmergencyFocus(env.BOARDVERSE_D1, match[1], request);
    }
    if (method === "POST" && (match = path.match(FOCUS_REPORT_RE))) {
      return handleFocusReport(request, env, match[1]);
    }
    const response = await appV020.fetch(request, env, ctx);
    return decorateHtml(response);
  },
  scheduled(event, env, ctx) {
    return appV020.scheduled(event, env, ctx);
  },
};
