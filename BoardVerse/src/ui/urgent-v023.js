const STYLE = String.raw`<style id="boardverse-v023-urgent-style">
/* Room action metadata belongs below the action buttons. */
#bvRoomMetaControls{display:grid;gap:7px;width:100%;margin-top:7px;min-width:0}
#bvRoomMetaControls #bvRoomSlow{margin:0!important;width:100%!important}
#bvRoomMetaControls #bvFocusGuardStatus{display:block!important;width:100%!important;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--panel3);white-space:normal!important;overflow-wrap:anywhere}
#bvFeatureControls.bv-room-action-strip{min-width:0!important}
/* Settings is a main-page workspace, so the page itself must scroll. */
body.room-mode.bv-room-settings-open{height:auto!important;min-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;display:block!important;place-items:initial!important}
body.room-mode.bv-room-settings-open .app-frame{width:100%!important;height:auto!important;max-height:none!important;aspect-ratio:auto!important;overflow:visible!important;margin:0 auto!important}
body.room-mode.bv-room-settings-open .workspace,body.room-mode.bv-room-settings-open #room{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}
body.room-mode.bv-room-settings-open #bvRoomSettingsWorkspace{height:auto!important;max-height:none!important;overflow:visible!important;padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))!important}
/* Every theme owns its accent; there is no separate accent-color setting. */
body.page-theme-black{--accent:#68b9ec!important;--accent2:#a9dfff!important;--line:#314759!important;--panel3:#0c141b!important}
body.page-theme-white{--accent:#176b87!important;--accent2:#0d526c!important;--line:#c4d1d6!important;--panel3:#fff!important}
body.page-theme-scifi{--accent:#36e6dd!important;--accent2:#8dfbf3!important}
body.page-theme-black .btn:not(.danger):not(.bv-id-owner),body.page-theme-black .theme-option[aria-checked="true"]{border-color:#477fa4!important;background:linear-gradient(135deg,#172b39,#275e7c 55%,#69b8e7)!important;color:#effaff!important;text-shadow:none!important}
body.page-theme-white .btn:not(.danger):not(.bv-id-owner),body.page-theme-white .theme-option[aria-checked="true"]{border-color:#176b87!important;background:linear-gradient(135deg,#0f5975,#2185a1 55%,#66b9cb)!important;color:#fff!important;text-shadow:none!important}
body.page-theme-scifi .btn:not(.danger):not(.bv-id-owner),body.page-theme-scifi .theme-option[aria-checked="true"]{border-color:#27b8c2!important;background:linear-gradient(135deg,#0d8391,#31e5da 48%,#7c67ff)!important;color:#031016!important}
/* The injected public account nav must never float over topbar controls. */
#bvPublicNav{box-sizing:border-box!important;max-width:100%!important}
@media(min-width:960px){.topbar{display:flex!important;align-items:center!important;flex-wrap:wrap!important}.topbar>.brand{flex:1 1 270px!important}.top-tools{flex:1 1 680px!important;min-width:0!important;max-width:none!important;justify-content:flex-end!important;flex-wrap:wrap!important}#bvPublicNav{position:static!important;inset:auto!important;display:flex!important;flex:0 1 auto!important;margin:0!important;padding:4px 6px!important;box-shadow:none!important}}
@media(max-width:959px){#bvPublicNav{position:static!important;inset:auto!important;margin:8px 8px 0 auto!important;width:max-content!important;max-width:calc(100vw - 16px)!important;overflow-x:auto!important;flex-wrap:nowrap!important}}
#bvEmergencyNoticeTitle{text-align:center!important;margin-left:38px!important;margin-right:38px!important}
@media(max-width:720px){#bvRoomMetaControls #bvRoomSlow{grid-template-columns:1fr!important}}
</style>`;

const SCRIPT = String.raw`<script id="boardverse-v023-urgent-script">(function(){
'use strict';if(window.__BOARDVERSE_V023_URGENT__)return;window.__BOARDVERSE_V023_URGENT__=true;
var nativeFetch=window.fetch.bind(window);
var GAME_OPTIONS=[['go9','圍棋 9×9'],['go13','圍棋 13×13'],['go19','圍棋 19×19'],['gomoku','五子棋'],['renju','連珠'],['xiangqi','中國象棋'],['xiangqi_random','隨機底線象棋'],['banqi','暗棋'],['qiguo','七國象棋'],['chess','西洋棋'],['reversi','黑白棋']];
function byId(id){return document.getElementById(id)}
function settingsGameSelect(){return byId('bvRsGameId')}
window.fetch=function(input,init){try{var url=typeof input==='string'?input:(input&&input.url)||'';if(/\/api\/rooms\/[A-Z2-9]{6}\/settings(?:\?|$)/.test(url)&&String(init&&init.method||'GET').toUpperCase()==='POST'&&init&&typeof init.body==='string'){var sel=settingsGameSelect();if(sel){var body=JSON.parse(init.body);body.gameId=sel.value;init=Object.assign({},init,{body:JSON.stringify(body)})}}}catch(_){}return nativeFetch(input,init)};
function patchGameSelector(){var w=byId('bvRoomSettingsWorkspace');if(!w||byId('bvRsGameId'))return;var labels=w.querySelectorAll('.bv-rs-field>label');for(var i=0;i<labels.length;i++){if(String(labels[i].textContent||'').trim()!=='棋類')continue;var field=labels[i].parentElement,old=field&&field.querySelector('input');if(!old)return;var sel=document.createElement('select');sel.id='bvRsGameId';GAME_OPTIONS.forEach(function(g){var o=document.createElement('option');o.value=g[0];o.textContent=g[1];sel.appendChild(o)});sel.value=old.value||'';sel.disabled=!!old.disabled;old.replaceWith(sel);var note=field.querySelector('.bv-rs-note');if(note)note.textContent=sel.disabled?'對局進行中不可切換棋類；本局結束後可直接在原房切換。':'切換棋類會保留房號、成員、聊天與歷史回放，重建新棋盤並取消所有準備；新棋類先採預設規則，儲存後可立即再次調整。';return}}
function relocateRoomMeta(){var controls=byId('bvFeatureControls');if(!controls)return;var slow=byId('bvRoomSlow'),focus=byId('bvFocusGuardStatus');if(!slow&&!focus)return;var meta=byId('bvRoomMetaControls');if(!meta){meta=document.createElement('div');meta.id='bvRoomMetaControls';controls.insertAdjacentElement('afterend',meta)}if(slow&&slow.parentElement!==meta)meta.appendChild(slow);if(focus&&focus.parentElement!==meta)meta.appendChild(focus)}
function integrateNav(){var nav=byId('bvPublicNav');if(!nav)return;var version=Array.from(nav.children).find(function(n){return n.tagName==='SPAN'&&/^v\d/i.test(String(n.textContent||'').trim())});if(version)version.remove();if(innerWidth>=960){var tools=document.querySelector('.top-tools');if(tools&&nav.parentElement!==tools)tools.appendChild(nav)}}
function removeAccentSetting(){document.querySelectorAll('label,.field-label,.setting-label,.theme-setting span').forEach(function(n){var t=String(n.textContent||'').replace(/\s+/g,'').toLowerCase();if(t!=='強調色'&&t!=='强调色'&&t!=='accentcolor'&&t!=='accent')return;var box=n.closest('.theme-setting,.field,.setting-row');if(box)box.remove();else n.remove()})}
function sync(){patchGameSelector();relocateRoomMeta();integrateNav();removeAccentSetting()}
var pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;sync()})}
window.addEventListener('resize',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();</script>`;

export function injectUrgentV023(source) {
  let body=String(source||'');
  if(!body.includes('id="boardverse-v023-urgent-style"')) body=body.replace(/<\/head>/i,`${STYLE}</head>`);
  if(!body.includes('id="boardverse-v023-urgent-script"')) body=body.replace(/<\/body>/i,`${SCRIPT}</body>`);
  return body;
}
