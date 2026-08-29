import appV014, { GameRoom as GameRoomBase } from "./index-v014.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GameRoomV013,
  GameRoomV014,
  GlobalChat,
  GlobalChatV011,
} from "./index-v014.js";

const ROOM_REPLAY_SCOPE_SCRIPT = String.raw`<script id="boardverse-room-replay-scope">(function(){
'use strict';
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function apply(){
  var card=document.getElementById('replayCard');
  if(!card)return;
  var hint=card.querySelector('[data-i18n="replayHint"]');
  if(hint)hint.textContent=text('完成的對局保留最近 12 局 · 房內使用者皆可查看 · 不提供下載','已完成的对局保留最近 12 局 · 房内用户均可查看 · 不提供下载','Latest 12 completed matches · room members can view · no downloads');
  card.setAttribute('data-bv-room-replay-view-only','1');
  document.querySelectorAll('#replayList .replay-row .small.muted,#replayMeta').forEach(function(node){
    var value=String(node.textContent||'');
    if(lang()==='zh-Hant')value=value.replace(/(\d+)\s*步數/g,'$1 步').replace(/ · partial/g,' · 部分紀錄');
    else if(lang()==='zh-Hans')value=value.replace(/(\d+)\s*步数/g,'$1 步').replace(/ · partial/g,' · 部分记录');
    node.textContent=value;
  });
  var eyebrow=document.querySelector('#replayOverlay .eyebrow');
  if(eyebrow)eyebrow.textContent=text('回放','回放','Replay');
  var close=document.getElementById('replayClose');
  if(close)close.setAttribute('aria-label',text('關閉回放','关闭回放','Close replay'));
  var range=document.getElementById('replayRange');
  if(range)range.setAttribute('aria-label',text('回放步數','回放步数','Replay step'));
}
var observer=new MutationObserver(function(){setTimeout(apply,0)});
observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('change',function(e){if(e.target&&e.target.id==='languageSelect')setTimeout(apply,0)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();</script>`;

const ADMIN_ZH_STYLE = String.raw`<style id="boardverse-admin-zh-style">
html[data-bv-admin-zh="1"] .admin-nav .nav-label{letter-spacing:.08em}
html[data-bv-admin-zh="1"] .heading .eyebrow{text-transform:none;letter-spacing:.08em}
html[data-bv-admin-zh="1"] .metric span{text-transform:none;letter-spacing:.04em}
</style>`;

const ADMIN_ZH_SCRIPT = String.raw`<script id="boardverse-admin-zh">(function(){
'use strict';
var TEXT={
  'Operations Workbench':'營運管理台','Administrator access':'管理員登入',
  'Users':'使用者','Rooms':'房間','Replays':'回放','Reports':'回報','Risk':'風險',
  'Replay':'回放','Risk Flags':'風險標記','Global Chat':'全局聊天室','Audit Log':'稽核紀錄',
  'ADMIN DATA':'管理資料','ACCOUNT CONTROL':'帳號管理','LIVE OPERATIONS':'即時房間管理',
  'REPLAY ARCHIVE':'回放封存','REPORT REVIEW':'回報審查','RISK REVIEW':'風險審查',
  'ANNOUNCEMENTS':'公告管理','CHAT MODERATION':'聊天管理','AUDIT TRAIL':'稽核紀錄',
  'Replay 操作':'回放操作','Replay ID':'回放 ID','離線 HTML':'下載離線 HTML',
  'Risk 審查':'風險審查','Risk ID':'風險 ID','Report ID':'回報 ID','Note / reason':'備註／原因',
  'Announcement ID':'公告 ID','Expires at':'到期時間','Global Chat Mute':'全局聊天室禁言',
  'User / Guest ID':'使用者／訪客 ID','User':'使用者','Guest':'訪客','Mute until':'禁言至','Mute':'套用禁言',
  'Message ID':'訊息 ID','Username / Email':'使用者名稱／Email','Username':'使用者名稱','Action':'操作',
  'Invalid response':'伺服器回應格式錯誤','Request failed':'操作失敗','player':'玩家'
};
var HEADERS={
  id:'ID',username:'使用者名稱',username_display:'使用者名稱',email_normalized:'Email',status:'狀態',level:'等級',gp:'GP',reputation:'信譽',
  room_id:'房號',room_name:'房間名稱',game_type:'棋類',variant:'變種',private_room:'私人房',voice_enabled:'語音',owner_user_id:'房主使用者 ID',players_json:'玩家資料',spectator_count:'觀眾數',live_status:'即時狀態',admin_paused:'管理暫停',admin_paused_at:'暫停時間',last_activity_at:'最後活動',closed_at:'關閉時間',
  game_instance_id:'對局實例 ID',result_json:'對局結果',finished_at:'結束時間',public_until:'公開期限',delete_after:'刪除時間',lifecycle:'保存狀態',
  type:'類型',description:'說明',target_user_id:'對象使用者 ID',reporter_user_id:'回報者 ID',guest_key:'訪客識別',current_url:'頁面網址',reason:'原因',note:'備註',
  risk_type:'風險類型',severity:'嚴重度',score:'分數',evidence_json:'證據',enabled:'啟用',slowMs:'慢速模式（毫秒）',connections:'連線數',
  message_text:'訊息',sender_name:'發送者',sender_kind:'發送者類型',channel:'頻道',created_at:'建立時間',updated_at:'更新時間',
  admin_actor:'管理員',action_type:'操作類型',target_type:'對象類型',target_id:'對象 ID',before_json:'變更前',after_json:'變更後',
  public_token_hash:'公開 Token 雜湊',delete_after:'刪除時間',public_until:'公開期限'
};
var VALUES={
  active:'啟用',suspended:'暫停',banned:'封禁',disabled:'停用',pending:'待處理',resolved:'已解決',rejected:'已拒絕',in_progress:'處理中',
  reviewed:'已審查',dismissed:'已排除',confirmed:'已確認',playing:'對局中',waiting:'等待中',finished:'已結束',closed:'已關閉',paused:'已暫停',
  public:'公開中',admin_only:'僅管理員',deleting_soon:'即將刪除',deletion_due:'等待刪除',normal:'一般',important:'重要',maintenance:'維護',
  user:'使用者',guest:'訪客',room:'房間',global:'全局',all:'全部'
};
var ACTIONS={
  warning:'警告',reputation_set:'設定信譽',gp_delta:'調整 GP',gp_zero:'GP 歸零',level_set:'設定等級',suspend:'暫停帳號',ban:'封禁帳號',restore:'恢復帳號',
  revoke_sessions:'撤銷所有登入工作階段',custom_room_suspend:'停用自訂房號',custom_room_restore:'恢復自訂房號',unlimited_custom_room:'無限自訂房',
  mute_global:'禁止全局聊天',mute_room:'禁止房內聊天',mute_all_chat:'禁止所有聊天',confirmed_cheating:'確認作弊',
  global_chat_slow_ms:'全局聊天室慢速模式（毫秒）',global_chat_enabled:'啟用全局聊天室',maintenance_mode:'維護模式'
};
var PLACEHOLDERS={'依 action 填寫':'依操作填寫','Username':'使用者名稱','Replay ID':'回放 ID','Report ID':'回報 ID','Risk ID':'風險 ID','timestamp，可空白':'Unix 時間戳（可留空）','Message ID':'訊息 ID'};
function exact(node){if(!node||node.children&&node.children.length)return;var raw=String(node.textContent||'').trim();if(TEXT[raw])node.textContent=TEXT[raw]}
function applyHeaders(){document.querySelectorAll('th').forEach(function(th){var k=String(th.textContent||'').trim();if(HEADERS[k])th.textContent=HEADERS[k]})}
function applyValues(){document.querySelectorAll('td,.badge').forEach(function(node){if(node.children.length)return;var k=String(node.textContent||'').trim();if(VALUES[k])node.textContent=VALUES[k]})}
function applyOptions(){document.querySelectorAll('option').forEach(function(o){var v=String(o.value||'');if(ACTIONS[v])o.textContent=ACTIONS[v];else if(VALUES[v])o.textContent=VALUES[v]})}
function applyInputs(){document.querySelectorAll('input,textarea').forEach(function(n){var p=n.getAttribute('placeholder');if(p&&PLACEHOLDERS[p])n.setAttribute('placeholder',PLACEHOLDERS[p])})}
function apply(){
  document.documentElement.dataset.bvAdminZh='1';
  if(document.title==='BoardVerse Admin Login')document.title='BoardVerse 管理員登入';else if(document.title==='BoardVerse Admin')document.title='BoardVerse 管理後台';
  document.querySelectorAll('span,button,label,h1,h2,h3,p,a,div').forEach(exact);
  applyHeaders();applyValues();applyOptions();applyInputs();
  var brand=document.querySelector('.brand h1');if(brand&&brand.textContent==='BoardVerse Admin')brand.textContent='BoardVerse 管理後台';
  var play=document.querySelector('a[href="/admin/play"]');if(play)play.textContent='以管理員身分進入棋室';
  var kicker=document.getElementById('viewKicker');if(kicker&&TEXT[kicker.textContent.trim()])kicker.textContent=TEXT[kicker.textContent.trim()];
  var title=document.getElementById('viewTitle');if(title&&TEXT[title.textContent.trim()])title.textContent=TEXT[title.textContent.trim()];
  var fieldLabels=document.querySelectorAll('.field label');fieldLabels.forEach(function(n){exact(n)});
}
var queued=false;function schedule(){if(queued)return;queued=true;setTimeout(function(){queued=false;apply()},0)}
var observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();</script>`;

function removeMisinterpretedPublicReplayRoomUi(source) {
  let body = String(source || "");
  body = body.replace(/;renderPublicReplay\(\)(?=\})/g, "");
  body = body.replace(/window\.addEventListener\('boardverse:replay',[\s\S]*?\nobserver=new MutationObserver/, "observer=new MutationObserver");
  return body;
}

function injectBeforeBody(source, snippet) {
  const body = String(source || "");
  if (/<\/body>/i.test(body)) return body.replace(/<\/body>/i, `${snippet}</body>`);
  return body + snippet;
}

function injectBeforeHeadEnd(source, snippet) {
  const body = String(source || "");
  if (/<\/head>/i.test(body)) return body.replace(/<\/head>/i, `${snippet}</head>`);
  return snippet + body;
}

export class GameRoom extends GameRoomBase {}
export class GameRoomV015 extends GameRoom {}

export default {
  async fetch(request, env, ctx) {
    const response = await appV014.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    const url = new URL(request.url);
    let body = removeMisinterpretedPublicReplayRoomUi(await response.text());

    if (!body.includes('id="boardverse-room-replay-scope"')) {
      body = injectBeforeBody(body, ROOM_REPLAY_SCOPE_SCRIPT);
    }

    if (url.pathname.startsWith("/admin")) {
      if (!body.includes('id="boardverse-admin-zh-style"')) body = injectBeforeHeadEnd(body, ADMIN_ZH_STYLE);
      if (!body.includes('id="boardverse-admin-zh"')) body = injectBeforeBody(body, ADMIN_ZH_SCRIPT);
    }

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
    return appV014.scheduled(event, env, ctx);
  },
};
