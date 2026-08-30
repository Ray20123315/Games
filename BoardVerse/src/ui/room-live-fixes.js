const ROOM_LIVE_FIXES_STYLE = String.raw`<style id="boardverse-room-live-fixes-style">
#bvFeatureControls.bv-room-action-strip{flex-wrap:wrap!important;overflow:visible!important;overscroll-behavior:auto!important;scrollbar-width:auto!important;padding-bottom:2px!important}
#bvFeatureControls.bv-room-action-strip>.btn{flex:0 1 auto!important;min-width:0!important;max-width:100%!important;white-space:normal!important}
#bvClockRow[hidden]{display:none!important}#bvClockRow{display:flex;align-items:center;width:100%;min-height:34px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel3);box-sizing:border-box}#bvClockRow #bvClock{display:block!important;width:100%;margin:0!important;white-space:normal!important;overflow-wrap:anywhere}
</style>`;

export const ROOM_LIVE_FIXES_SCRIPT = String.raw`<script id="boardverse-room-live-fixes">(function(){
'use strict';if(window.__BOARDVERSE_ROOM_LIVE_FIXES__)return;window.__BOARDVERSE_ROOM_LIVE_FIXES__=true;
var feature=null,pending=false;
function byId(id){return document.getElementById(id)}
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(_){return'zh-Hant'}}
function text(h,s,e){var l=lang();return l==='en'?e:l==='zh-Hans'?s:h}
function ensureClockRow(){var controls=byId('bvFeatureControls'),clock=byId('bvClock');if(!controls||!clock)return;var meta=byId('bvRoomMetaControls');if(!meta){meta=document.createElement('div');meta.id='bvRoomMetaControls';controls.insertAdjacentElement('afterend',meta)}var row=byId('bvClockRow');if(!row){row=document.createElement('div');row.id='bvClockRow';meta.insertBefore(row,meta.firstChild)}if(clock.parentElement!==row)row.appendChild(clock);var c=feature&&feature.clock,timed=!!(c&&c.mode&&c.mode!=='untimed');row.hidden=!timed;clock.setAttribute('aria-hidden',timed?'false':'true')}
function syncSettingsGameSelector(){var sel=byId('bvRsGameId');if(!sel||!feature||!feature.status)return;var playing=feature.status==='playing';if(sel.disabled!==playing)sel.disabled=playing;var field=sel.closest('.bv-rs-field'),note=field&&field.querySelector('.bv-rs-note');if(note)note.textContent=playing?text('對局進行中不可切換棋類；本局結束後可直接在原房切換。','对局进行中不可切换棋类；本局结束后可直接在原房切换。','Game type cannot be changed during an active match; switch it in this room after the game ends.'):text('切換棋類會保留房號、成員、聊天與歷史回放，重建新棋盤並取消所有準備；新棋類先採預設規則，儲存後可立即再次調整。','切换棋类会保留房号、成员、聊天与历史回放，重建新棋盘并取消所有准备；新棋类先采用默认规则，保存后可立即再次调整。','Switching games keeps the room code, members, chat, and replay history, rebuilds the board, and clears ready state. The new game starts with default rules that can be adjusted immediately.')}
function fixOpeningPrompt(){var textNode=byId('openingText'),actions=byId('openingActions');if(!textNode||!actions||actions.querySelector('button'))return;var raw=String(textNode.textContent||'');if(raw.indexOf('取得選色權，請選擇持色。')>=0)textNode.textContent=raw.replace('取得選色權，請選擇持色。','取得選色權，等待該玩家選擇持色。');else if(raw.indexOf('取得选色权，请选择持色。')>=0)textNode.textContent=raw.replace('取得选色权，请选择持色。','取得选色权，等待该玩家选择持色。');else if(lang()==='en'&&/ won the guess and chooses a color\.$/.test(raw))textNode.textContent=raw.replace(' won the guess and chooses a color.',' won the guess; waiting for that player to choose a color.')}
function sync(){pending=false;ensureClockRow();syncSettingsGameSelector();fixOpeningPrompt()}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(sync)}
window.addEventListener('boardverse:feature',function(e){feature=e.detail||null;schedule()});
window.addEventListener('boardverse:language',schedule);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();</script>`;

export function injectRoomLiveFixes(source) {
  let body = String(source || '');
  if (!body.includes('id="boardverse-room-live-fixes-style"')) body = /<\/head>/i.test(body) ? body.replace(/<\/head>/i, `${ROOM_LIVE_FIXES_STYLE}</head>`) : ROOM_LIVE_FIXES_STYLE + body;
  if (!body.includes('id="boardverse-room-live-fixes"')) body = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${ROOM_LIVE_FIXES_SCRIPT}</body>`) : body + ROOM_LIVE_FIXES_SCRIPT;
  return body;
}
