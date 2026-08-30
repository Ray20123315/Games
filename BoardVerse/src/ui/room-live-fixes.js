const ROOM_LIVE_FIXES_STYLE = String.raw`<style id="boardverse-room-live-fixes-style">
#bvClockRow[hidden]{display:none!important}#bvClockRow{display:flex;align-items:center;width:100%;min-height:34px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel3);box-sizing:border-box}#bvClockRow #bvClock{display:block!important;width:100%;margin:0!important;white-space:normal!important;overflow-wrap:anywhere}
</style>`;

export const ROOM_LIVE_FIXES_SCRIPT = String.raw`<script id="boardverse-room-live-fixes">(function(){
'use strict';if(window.__BOARDVERSE_ROOM_LIVE_FIXES__)return;window.__BOARDVERSE_ROOM_LIVE_FIXES__=true;
var feature=null,pending=false;
function byId(id){return document.getElementById(id)}
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(_){return'zh-Hant'}}
function ensureClockRow(){var controls=byId('bvFeatureControls'),clock=byId('bvClock');if(!controls||!clock)return;var meta=byId('bvRoomMetaControls');if(!meta){meta=document.createElement('div');meta.id='bvRoomMetaControls';controls.insertAdjacentElement('afterend',meta)}var row=byId('bvClockRow');if(!row){row=document.createElement('div');row.id='bvClockRow';meta.insertBefore(row,meta.firstChild)}if(clock.parentElement!==row)row.appendChild(clock);var c=feature&&feature.clock,timed=!!(c&&c.mode&&c.mode!=='untimed');row.hidden=!timed;clock.setAttribute('aria-hidden',timed?'false':'true')}
function fixOpeningPrompt(){var text=byId('openingText'),actions=byId('openingActions');if(!text||!actions||actions.querySelector('button'))return;var raw=String(text.textContent||'');if(raw.indexOf('取得選色權，請選擇持色。')>=0)text.textContent=raw.replace('取得選色權，請選擇持色。','取得選色權，等待該玩家選擇持色。');else if(raw.indexOf('取得选色权，请选择持色。')>=0)text.textContent=raw.replace('取得选色权，请选择持色。','取得选色权，等待该玩家选择持色。');else if(lang()==='en'&&/ won the guess and chooses a color\.$/.test(raw))text.textContent=raw.replace(' won the guess and chooses a color.',' won the guess; waiting for that player to choose a color.')}
function sync(){pending=false;ensureClockRow();fixOpeningPrompt()}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(sync)}
window.addEventListener('boardverse:feature',function(e){feature=e.detail||null;schedule()});
window.addEventListener('boardverse:language',schedule);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();</script>`;

export function injectRoomLiveFixes(source) {
  let body = String(source || '');
  if (!body.includes('id="boardverse-room-live-fixes-style"')) body = /<\/head>/i.test(body) ? body.replace(/<\/head>/i, `${ROOM_LIVE_FIXES_STYLE}</head>`) : ROOM_LIVE_FIXES_STYLE + body;
  if (!body.includes('id="boardverse-room-live-fixes"')) body = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${ROOM_LIVE_FIXES_SCRIPT}</body>`) : body + ROOM_LIVE_FIXES_SCRIPT;
  return body;
}
