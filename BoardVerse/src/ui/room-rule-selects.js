export const ROOM_RULE_SELECT_SCRIPT = String.raw`<script id="boardverse-room-rule-selects">(function(){
'use strict';if(window.__BOARDVERSE_ROOM_RULE_SELECTS__)return;window.__BOARDVERSE_ROOM_RULE_SELECTS__=true;
function gameId(){var labels=document.querySelectorAll('#bvRoomSettingsWorkspace .bv-rs-field>label');for(var i=0;i<labels.length;i++){if(String(labels[i].textContent||'').trim()==='棋類'){var n=labels[i].parentElement&&labels[i].parentElement.querySelector('input,select');if(n)return String(n.value||'')}}return''}
var MAP={
 sideMode:{go9:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']],go13:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']],go19:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']],gomoku:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']],renju:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']],xiangqi:[['random','隨機抽籤'],['manual','玩家協議']],xiangqi_random:[['random','隨機抽籤'],['manual','玩家協議']],chess:[['hidden','雙手藏棋'],['random','隨機抽籤'],['manual','玩家協議']],reversi:[['guess','猜單雙'],['random','隨機抽籤'],['manual','玩家協議']]},
 variant:{gomoku:[['freestyle','Freestyle 五子以上'],['exact5','Exact-Five 精確五連'],['connect6','Connect6 六子棋']],chess:[['standard','標準西洋棋'],['threecheck','Three-Check 三將棋'],['koth','King of the Hill 王者登峰']]},
 boardSize:{gomoku:[[15,'15×15'],[19,'19×19']],reversi:[[6,'6×6'],[8,'8×8 標準'],[10,'10×10 Grand']]},
 opening:{gomoku:[['none','無限制'],['pro','Pro 開局'],['swap','Swap 交換持色']],renju:[['free','自由開局']]},
 objective:{reversi:[['normal','標準：棋子多者勝'],['misere','Anti-Othello：棋子少者勝']]},
 drawMode:{qiguo:[['country','抽國家／聯盟'],['number','抽 1～N 號後依序選國']]}
};
function enhance(){var g=gameId();document.querySelectorAll('#bvRsRules [data-rule]').forEach(function(old){var key=old.getAttribute('data-rule'),opts=MAP[key]&&MAP[key][g];if(!opts||old.tagName==='SELECT')return;var s=document.createElement('select');s.setAttribute('data-rule',key);s.disabled=old.disabled;opts.forEach(function(o){var x=document.createElement('option');x.value=String(o[0]);x.textContent=String(o[1]);s.appendChild(x)});s.value=String(old.value);old.replaceWith(s)})}
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();</script>`;
export function injectRuleSelectAddon(body){const html=String(body||'');return html.includes('boardverse-room-rule-selects')?html:html.replace(/<\/body>/i,`${ROOM_RULE_SELECT_SCRIPT}</body>`)}
