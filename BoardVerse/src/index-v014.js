import appV013, { GameRoom as GameRoomBase } from "./index-v013.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GameRoomV013,
  GlobalChat,
  GlobalChatV011,
} from "./index-v013.js";

const PUBLIC_REPLAY_DOWNLOAD_RE = /^\/replay\/[^/]+\/download$/;
const PUBLIC_REPLAY_VIEW_RE = /^\/replay\/[^/]+$/;

const CUSTOM_MODAL_STYLE = String.raw`<style id="boardverse-unified-modal-style">
#bvUnifiedModal{position:fixed;z-index:50000;inset:0;display:none;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px)}
#bvUnifiedModal.show{display:grid}
#bvUnifiedModalCard{width:min(480px,94vw);max-height:min(82vh,680px);overflow:auto;border:1px solid var(--line,#514631);border-radius:18px;background:var(--panel,#17140f);color:var(--text,#f3ede2);box-shadow:0 28px 90px rgba(0,0,0,.62);padding:18px}
#bvUnifiedModalCard h3{margin:0 0 8px;font-size:18px;line-height:1.25;color:inherit}
#bvUnifiedModalMessage{margin:0;color:var(--muted,#aa9e8b);font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
#bvUnifiedModalInputWrap{display:none;margin-top:14px}
#bvUnifiedModalInputWrap.show{display:block}
#bvUnifiedModalInput{width:100%;min-height:44px;border:1px solid var(--line,#514631);border-radius:11px;background:var(--panel3,#0c0c0a);color:var(--text,#f3ede2);padding:10px 12px;font:inherit;box-sizing:border-box}
#bvUnifiedModalInput:focus{outline:3px solid rgba(195,161,95,.2);border-color:#c3a15f}
#bvUnifiedModalActions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}
#bvUnifiedModalActions button{appearance:none;min-height:38px;padding:8px 13px;border:1px solid var(--line,#514631);border-radius:10px;background:var(--panel2,#211c14);color:var(--text,#f3ede2);font:800 13px/1 system-ui,-apple-system,"Microsoft JhengHei",sans-serif;cursor:pointer}
#bvUnifiedModalActions #bvUnifiedModalConfirm{border-color:#a98546;background:linear-gradient(135deg,#806a3c,#c3a15f 55%,#e7d7a8);color:#211a0f}
#bvUnifiedModalActions #bvUnifiedModalCancel{background:transparent}
@media(max-width:560px){#bvUnifiedModal{padding:10px}#bvUnifiedModalCard{width:100%;border-radius:15px}}
</style>`;

const CUSTOM_MODAL_BOOTSTRAP = String.raw`<script id="boardverse-unified-modal-bootstrap">(function(){
'use strict';
if(window.BoardVerseModal)return;
var activeResolve=null,lastFocus=null;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function mount(){var old=document.getElementById('bvUnifiedModal');if(old)return old;var overlay=document.createElement('div');overlay.id='bvUnifiedModal';overlay.setAttribute('role','presentation');var card=document.createElement('section');card.id='bvUnifiedModalCard';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-labelledby','bvUnifiedModalTitle');card.innerHTML='<h3 id="bvUnifiedModalTitle"></h3><p id="bvUnifiedModalMessage"></p><div id="bvUnifiedModalInputWrap"><input id="bvUnifiedModalInput" autocomplete="off"></div><div id="bvUnifiedModalActions"><button id="bvUnifiedModalCancel" type="button"></button><button id="bvUnifiedModalConfirm" type="button"></button></div>';overlay.appendChild(card);document.body.appendChild(overlay);overlay.addEventListener('click',function(e){if(e.target===overlay)finish(null)});document.addEventListener('keydown',function(e){if(!overlay.classList.contains('show'))return;if(e.key==='Escape'){e.preventDefault();finish(null)}else if(e.key==='Enter'&&document.activeElement&&document.activeElement.id==='bvUnifiedModalInput'){e.preventDefault();document.getElementById('bvUnifiedModalConfirm').click()}});return overlay}
function finish(value){var overlay=document.getElementById('bvUnifiedModal');if(overlay)overlay.classList.remove('show');var resolve=activeResolve;activeResolve=null;if(lastFocus&&typeof lastFocus.focus==='function'){try{lastFocus.focus()}catch(e){}}lastFocus=null;if(resolve)resolve(value)}
function open(options){options=options||{};return new Promise(function(resolve){if(activeResolve)finish(null);activeResolve=resolve;lastFocus=document.activeElement;var overlay=mount(),title=document.getElementById('bvUnifiedModalTitle'),message=document.getElementById('bvUnifiedModalMessage'),wrap=document.getElementById('bvUnifiedModalInputWrap'),input=document.getElementById('bvUnifiedModalInput'),cancel=document.getElementById('bvUnifiedModalCancel'),confirm=document.getElementById('bvUnifiedModalConfirm');title.textContent=String(options.title||text('BoardVerse 提示','BoardVerse 提示','BoardVerse'));message.textContent=String(options.message||'');var hasInput=options.inputValue!==undefined;wrap.classList.toggle('show',hasInput);input.value=hasInput?String(options.inputValue||''):'';input.readOnly=!!options.readOnly;input.setAttribute('aria-label',String(options.inputLabel||options.title||'Input'));cancel.style.display=options.cancel===false?'none':'';cancel.textContent=String(options.cancelText||text('取消','取消','Cancel'));confirm.textContent=String(options.confirmText||text('確定','确定','OK'));cancel.onclick=function(){finish(null)};confirm.onclick=function(){finish(hasInput?input.value:true)};overlay.classList.add('show');setTimeout(function(){(hasInput?input:confirm).focus();if(hasInput&&!input.readOnly)input.select()},0)})}
var api={
  alert:function(message,options){options=options||{};return open({title:options.title||text('BoardVerse 提示','BoardVerse 提示','BoardVerse'),message:message,cancel:false,confirmText:options.confirmText||text('知道了','知道了','OK')})},
  confirm:function(message,options){options=options||{};return open({title:options.title||text('請確認','请确认','Confirm'),message:message,cancel:true,cancelText:options.cancelText||text('取消','取消','Cancel'),confirmText:options.confirmText||text('確定','确定','Confirm')}).then(function(v){return v===true})},
  prompt:function(message,value,options){options=options||{};return open({title:options.title||text('BoardVerse','BoardVerse','BoardVerse'),message:message,inputValue:value==null?'':value,inputLabel:options.inputLabel||message,readOnly:!!options.readOnly,cancel:options.cancel!==false,cancelText:options.cancelText||text('取消','取消','Cancel'),confirmText:options.confirmText||text('完成','完成','Done')})}
};
window.BoardVerseModal=api;
window.alert=function(message){api.alert(String(message==null?'':message));};
window.prompt=function(message,value){api.prompt(String(message==null?'':message),value==null?'':String(value));return null;};
window.confirm=function(message){api.confirm(String(message==null?'':message));return false;};
})();</script>`;

const CUSTOM_MODAL_PATCHES = String.raw`<script id="boardverse-unified-modal-patches">(function(){
'use strict';
var feature=null,observer=null;
function $id(id){return document.getElementById(id)}
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function jsonApi(path,opt){return fetch(path,opt).then(function(r){return r.json().catch(function(){return{message:'Invalid response'}}).then(function(d){if(!r.ok)throw new Error(d.message||'Request failed');return d&&Object.prototype.hasOwnProperty.call(d,'data')?d.data:d})})}
function post(path,body){return jsonApi(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
function replaceButton(button,handler){if(!button||button.dataset.bvCustomModalPatched==='1')return button;var clone=button.cloneNode(true);clone.dataset.bvCustomModalPatched='1';button.replaceWith(clone);clone.addEventListener('click',handler);return clone}
function patchHostKick(){var panel=$id('bvHostKickPanel');if(!panel||!feature||!Array.isArray(feature.kickableMembers))return;var buttons=panel.querySelectorAll('.queue-row button');buttons.forEach(function(button,index){var member=feature.kickableMembers[index];if(!member)return;replaceButton(button,async function(){var current=feature&&Array.isArray(feature.kickableMembers)?feature.kickableMembers.find(function(x){return x&&x.id===member.id}):null;if(!current)return;var phase=feature.status==='playing'&&current.seated?'\n\n'+text('此玩家正在對局，本局會以無結果終止。','此玩家正在对局，本局会以无结果终止。','This player is in the active game; the game will end with no result.'):'';var ok=await window.BoardVerseModal.confirm(text('確定要將「'+current.name+'」踢出房間嗎？','确定要将“'+current.name+'”踢出房间吗？','Kick “'+current.name+'” from the room?')+phase,{title:text('房主管理','房主管理','Host controls'),confirmText:text('踢出','踢出','Kick')});if(!ok)return;var bridge=window.BoardVerseBridge;if(!bridge||typeof bridge.send!=='function'||!bridge.send({type:'host_kick',memberId:current.id,revision:feature.revision})){window.BoardVerseModal.alert(text('目前無法送出踢人指令。','目前无法送出踢人指令。','Unable to send the kick command right now.'));return}this.disabled=true;var self=this;setTimeout(function(){self.disabled=false},1200)})})}
function selectedRoomIds(){return Array.from(document.querySelectorAll('[data-room-check][aria-checked="true"]')).map(function(n){return n.getAttribute('data-room-check')}).filter(Boolean)}
function patchAdminAnnouncement(){var wrap=$id('bvRoomAnnouncementControls');if(!wrap)return;var input=$id('bvRoomAnnouncementText'),buttons=wrap.querySelectorAll('button'),send=buttons[0],clear=buttons[1];if(send)replaceButton(send,async function(){var value=String(input&&input.value||'').trim(),ids=selectedRoomIds();if(!ids.length){await window.BoardVerseModal.alert('請先選擇至少一個房間。');return}if(!value){if(input)input.focus();return}this.disabled=true;if(clear)clear.disabled=true;try{var d=await post('/admin/api/rooms/announcement',{roomIds:ids,text:value});await window.BoardVerseModal.alert('公告已發送到 '+d.succeeded+' 個房間');if(input)input.value=''}catch(e){await window.BoardVerseModal.alert(e.message||'公告發送失敗')}finally{this.disabled=false;if(clear)clear.disabled=false}});if(clear)replaceButton(clear,async function(){var ids=selectedRoomIds();if(!ids.length){await window.BoardVerseModal.alert('請先選擇至少一個房間。');return}var ok=await window.BoardVerseModal.confirm('確定清除所選房間目前的房內公告？',{title:'清除房內公告',confirmText:'清除'});if(!ok)return;this.disabled=true;try{var d=await post('/admin/api/rooms/announcement',{roomIds:ids,text:''});await window.BoardVerseModal.alert('公告已清除：'+d.succeeded+' 個房間')}catch(e){await window.BoardVerseModal.alert(e.message||'清除公告失敗')}finally{this.disabled=false}})}
function patchPresetDelete(){document.querySelectorAll('[data-delete-preset]').forEach(function(button){var id=button.getAttribute('data-delete-preset');replaceButton(button,async function(){var ok=await window.BoardVerseModal.confirm(text('確定刪除此房間 Preset？','确定删除此房间 Preset？','Delete this room preset?'),{title:text('刪除 Preset','删除 Preset','Delete preset'),confirmText:text('刪除','删除','Delete')});if(!ok)return;var r=await fetch('/api/presets/'+encodeURIComponent(id),{method:'DELETE'});if(r.ok){var row=this.closest('[data-preset-row]');if(row)row.remove()}else{var d=await r.json().catch(function(){return{}});await window.BoardVerseModal.alert(d.message||text('刪除失敗','删除失败','Delete failed'))}})})}
function patchAdminCleanup(){var ann=$id('annDelete');if(ann)replaceButton(ann,async function(){var id=String($id('annId')&&$id('annId').value||'').trim(),reason=String($id('annReason')&&$id('annReason').value||'').trim();if(!id){await window.BoardVerseModal.alert('請先點選公告或輸入 Announcement ID');return}if(!reason){await window.BoardVerseModal.alert('永久刪除公告必須填寫原因');if($id('annReason'))$id('annReason').focus();return}var ok=await window.BoardVerseModal.confirm('確定永久刪除此公告？此操作不可復原，但會保留 Audit Log。',{title:'永久刪除公告',confirmText:'永久刪除'});if(!ok)return;try{await post('/admin/api/announcement/delete',{id:id,reason:reason});['annId','annTitle','annContent','annExpires','annReason'].forEach(function(x){var n=$id(x);if(n)n.value=''});await window.BoardVerseModal.alert('公告已永久刪除');var tab=document.querySelector('[data-tab="announcements"]');if(tab)tab.click()}catch(e){await window.BoardVerseModal.alert(e.message||'刪除公告失敗')}});var reset=$id('resetSetting');if(reset)replaceButton(reset,async function(){var key=String($id('settingKey')&&$id('settingKey').value||''),reason=String($id('settingReason')&&$id('settingReason').value||'').trim();if(!reason){await window.BoardVerseModal.alert('恢復預設必須填寫原因');if($id('settingReason'))$id('settingReason').focus();return}var ok=await window.BoardVerseModal.confirm('確定將此設定恢復為系統預設？',{title:'恢復系統預設',confirmText:'恢復預設'});if(!ok)return;try{await post('/admin/api/settings/reset',{key:key,reason:reason});await window.BoardVerseModal.alert('已恢復系統預設');var tab=document.querySelector('[data-tab="settings"]');if(tab)tab.click()}catch(e){await window.BoardVerseModal.alert(e.message||'恢復設定失敗')}})}
function patchShare(){var share=$id('bvShare');if(!share)return;replaceButton(share,async function(){var value=await window.BoardVerseModal.prompt(text('分享房間連結','分享房间链接','Share room link'),location.href,{title:text('分享','分享','Share'),readOnly:true,confirmText:text('複製連結','复制链接','Copy link')});if(value==null)return;try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(value);await window.BoardVerseModal.alert(text('連結已複製。','链接已复制。','Link copied.'))}catch(e){await window.BoardVerseModal.prompt(text('請手動複製此連結。','请手动复制此链接。','Copy this link manually.'),value,{title:text('複製連結','复制链接','Copy link'),readOnly:true,cancel:false})}})}
function roomId(){try{var s=JSON.parse(localStorage.getItem('boardverseSession')||'null');return s&&s.roomId||''}catch(e){return''}}
function replayStoreKey(){var id=roomId();return id?'boardversePublicReplay:'+id:''}
function renderPublicReplay(){var list=$id('replayList'),key=replayStoreKey();if(!list||!key||list.querySelector('[data-bv-public-replay]'))return;var data=null;try{data=JSON.parse(sessionStorage.getItem(key)||'null')}catch(e){}if(!data||!data.url)return;var row=document.createElement('div');row.className='replay-row';row.setAttribute('data-bv-public-replay','1');var info=document.createElement('div'),strong=document.createElement('strong'),meta=document.createElement('div'),button=document.createElement('button');strong.textContent=text('公開回放','公开回放','Public replay');meta.className='small muted';meta.textContent=text('只供觀看 · 不提供下載','仅供观看 · 不提供下载','View only · downloads disabled');button.type='button';button.className='btn ghost';button.textContent=text('查看','查看','View');button.addEventListener('click',function(){location.assign(data.url)});info.appendChild(strong);info.appendChild(meta);row.appendChild(info);row.appendChild(button);list.insertBefore(row,list.firstChild)}
function patchAll(){patchHostKick();patchAdminAnnouncement();patchPresetDelete();patchAdminCleanup();patchShare();renderPublicReplay()}
window.addEventListener('boardverse:feature',function(e){feature=e.detail||null;setTimeout(patchAll,0)});
window.addEventListener('boardverse:replay',function(e){var d=e.detail||{},key=replayStoreKey();if(!d.url||!key)return;sessionStorage.setItem(key,JSON.stringify({url:String(d.url),publicUntil:Number(d.publicUntil)||0,replayId:String(d.replayId||'')}));renderPublicReplay();window.BoardVerseModal.confirm(text('回放已封存，房內使用者現在可以查看。此公開頁面只供觀看，不提供下載。','回放已封存，房内用户现在可以查看。此公开页面仅供观看，不提供下载。','Replay archived. Room users can view it now; the public page is view-only with downloads disabled.'),{title:text('回放已就緒','回放已就绪','Replay ready'),confirmText:text('查看回放','查看回放','View replay'),cancelText:text('稍後','稍后','Later')}).then(function(ok){if(ok)location.assign(String(d.url))})});
observer=new MutationObserver(function(){setTimeout(patchAll,0)});observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patchAll,{once:true});else patchAll();
})();</script>`;

function injectCustomModal(source) {
  let body = String(source || "");
  if (!body.includes('id="boardverse-unified-modal-style"')) {
    if (/<\/head>/i.test(body)) body = body.replace(/<\/head>/i, `${CUSTOM_MODAL_STYLE}${CUSTOM_MODAL_BOOTSTRAP}</head>`);
    else body = CUSTOM_MODAL_STYLE + CUSTOM_MODAL_BOOTSTRAP + body;
  }
  if (!body.includes('id="boardverse-unified-modal-patches"')) {
    if (/<\/body>/i.test(body)) body = body.replace(/<\/body>/i, `${CUSTOM_MODAL_PATCHES}</body>`);
    else body += CUSTOM_MODAL_PATCHES;
  }
  return body;
}

function stripPublicReplayDownload(source) {
  return String(source || "").replace(/<div class="card"><a[^>]*id="offlineLink"[^>]*>[\s\S]*?<\/a><\/div>/gi, "");
}

function viewOnlyReplayDownloadResponse() {
  return new Response(JSON.stringify({
    ok: false,
    error: "replay_download_disabled",
    message: "此 Replay 只提供線上觀看，不提供下載。",
  }), {
    status: 403,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export class GameRoom extends GameRoomBase {}
export class GameRoomV014 extends GameRoom {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && PUBLIC_REPLAY_DOWNLOAD_RE.test(url.pathname)) {
      return viewOnlyReplayDownloadResponse();
    }

    const response = await appV013.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    let body = await response.text();
    if (PUBLIC_REPLAY_VIEW_RE.test(url.pathname)) body = stripPublicReplayDownload(body);
    body = injectCustomModal(body);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("cache-control", "no-store");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  scheduled(event, env, ctx) {
    return appV013.scheduled(event, env, ctx);
  },
};
