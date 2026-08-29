import { html } from "../core/http.js";

const shell = (title, body, script = "") => html(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
:root{color-scheme:dark;--bg:#11100d;--card:#17140f;--field:#211c14;--line:#3b3327;--line2:#514631;--text:#f3ede2;--muted:#aa9e8b;--gold:#c3a15f;--gold2:#e0bd72;--goldText:#211a0f;--bad:#ff747b}
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif;background:var(--bg);color:var(--text);margin:0}.wrap{max-width:1480px;margin:auto;padding:22px}.card{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:15px;margin:12px 0}.admin-head{display:flex;align-items:center;gap:14px;margin-bottom:14px}.admin-head h1{flex:1;margin:0}.admin-head .links{display:flex;gap:12px;white-space:nowrap}a{color:#e8d9ad}.summary-strip{display:flex;flex-wrap:nowrap;gap:10px;overflow-x:auto;padding:2px 2px 8px}.summary-card{flex:1 0 165px;min-width:165px;margin:0;padding:14px;border:1px solid var(--line);background:var(--card);border-radius:14px}.summary-label{font-weight:800}.summary-value{font-size:28px;line-height:1.15;margin-top:3px}.admin-tabs{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:1px 0 8px}.admin-tabs button{flex:0 0 auto;white-space:nowrap}.admin-tabs button.active{outline:2px solid #f2d28b;outline-offset:1px;background:var(--gold2)}.panel-card{min-height:360px}.panel-head{display:flex;gap:12px;align-items:end;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px}.panel-head h2{margin:0;flex:1}.panel-hint{color:var(--muted);font-size:13px}.panel-body{overflow:auto}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.toolbar input,.toolbar select{width:auto;min-width:180px}.toolbar .spacer{flex:1}.selection-count{color:var(--muted);font-size:13px}.bad{color:var(--bad)}input,button,select,textarea{font:inherit;border:1px solid var(--line2);border-radius:9px;background:var(--field);color:var(--text);padding:8px}input,select,textarea{width:100%}textarea{min-height:90px;resize:vertical}button{width:auto;cursor:pointer;background:var(--gold);color:var(--goldText);font-weight:800}button.secondary{background:#2b251b;color:var(--text)}button.danger{background:#9e5f58;color:#fff}button:disabled{opacity:.55;cursor:not-allowed}table{width:100%;border-collapse:collapse;font-size:13px;min-width:720px}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{position:sticky;top:0;background:#1c1812;z-index:1}.num{width:54px;color:var(--muted)}.check-col{width:42px;text-align:center}.check-col input{width:auto}.muted{color:var(--muted)}.nowrap{white-space:nowrap}.row-actions{display:flex;gap:6px;flex-wrap:wrap}.row-actions button{padding:5px 8px;font-size:12px}.empty{padding:22px 4px;color:var(--muted)}.note{font-size:12px;color:var(--muted);margin:5px 0}
dialog.admin-dialog{width:min(620px,calc(100vw - 24px));max-height:min(82vh,760px);overflow:auto;border:1px solid var(--line2);border-radius:16px;background:var(--card);color:var(--text);padding:0;box-shadow:0 24px 80px #000b}dialog.admin-dialog::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(2px)}.dialog-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}.dialog-head h2{margin:0;flex:1;font-size:20px}.dialog-body{padding:16px 18px}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid var(--line)}.dialog-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dialog-field{display:flex;flex-direction:column;gap:5px}.dialog-field.wide{grid-column:1/-1}.dialog-field span{font-weight:700;font-size:13px}.dialog-targets{padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#14110d;max-height:120px;overflow:auto}.dialog-message{white-space:pre-wrap;line-height:1.5}.dialog-result-list{margin:8px 0 0;padding-left:20px}.dialog-close-x{background:transparent;color:var(--text);padding:4px 8px}.action-hint{font-size:12px;color:var(--muted);margin-top:5px}
@media(max-width:720px){.wrap{padding:12px}.admin-head{align-items:flex-start;flex-direction:column}.panel-head{align-items:flex-start;flex-direction:column}.summary-card{flex-basis:145px;min-width:145px}.dialog-grid{grid-template-columns:1fr}.toolbar input,.toolbar select{width:100%}}
</style></head><body><div class="wrap">${body}</div><script>${script}</script></body></html>`);

export function adminLoginPage(message = "") {
  return shell("BoardVerse Admin Login", `<div class="card" style="max-width:460px;margin:12vh auto"><h1>BoardVerse 管理後台</h1><p class="muted">單一固定管理員登入</p>${message ? `<p class="bad">${escapeHtml(message)}</p>` : ""}<form method="post" action="/admin/login"><p><input name="username" autocomplete="username" placeholder="管理員帳號" required></p><p><input name="password" type="password" autocomplete="current-password" placeholder="密碼" required></p><button type="submit">登入</button></form></div>`);
}

export function adminDashboardPage() {
  return shell("BoardVerse Admin", `<header class="admin-head"><h1 data-bv-h="BoardVerse 管理後台" data-bv-s="BoardVerse 管理后台" data-bv-e="BoardVerse Admin">BoardVerse 管理後台</h1><nav class="links"><a href="/admin/play" data-bv-h="以管理員身分開棋室" data-bv-s="以管理员身份开棋室" data-bv-e="Open room as admin">以管理員身分開棋室</a><a href="/admin/logout" data-bv-h="登出" data-bv-s="退出" data-bv-e="Sign out">登出</a></nav></header><section id="summary" class="summary-strip" aria-label="摘要"></section><section class="card"><div id="adminTabs" class="admin-tabs" role="tablist" aria-label="管理功能"></div></section><section class="card panel-card"><div class="panel-head"><h2 id="outTitle">資料</h2><div id="panelHint" class="panel-hint"></div></div><div id="out" class="panel-body"></div></section><dialog id="adminDialog" class="admin-dialog" aria-labelledby="adminDialogTitle"><form id="adminDialogForm"><div class="dialog-head"><h2 id="adminDialogTitle"></h2><button type="button" id="adminDialogX" class="dialog-close-x" aria-label="Close">×</button></div><div id="adminDialogBody" class="dialog-body"></div><div class="dialog-actions"><button type="button" id="adminDialogCancel" class="secondary">取消</button><button type="submit" id="adminDialogConfirm">確認</button></div></form></dialog>`, String.raw`
const out=document.getElementById('out'),title=document.getElementById('outTitle'),hint=document.getElementById('panelHint'),tabsEl=document.getElementById('adminTabs');
const dlg=document.getElementById('adminDialog'),dlgForm=document.getElementById('adminDialogForm'),dlgTitle=document.getElementById('adminDialogTitle'),dlgBody=document.getElementById('adminDialogBody'),dlgCancel=document.getElementById('adminDialogCancel'),dlgConfirm=document.getElementById('adminDialogConfirm'),dlgX=document.getElementById('adminDialogX');
function locale(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return'zh-Hant'}}
function T(h,s,e){const l=locale();return l==='en'?e:l==='zh-Hans'?s:h}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}
async function api(path,opt){const r=await fetch(path,opt);const d=await r.json().catch(()=>({message:T('回應格式錯誤','响应格式错误','Invalid response')}));if(!r.ok)throw new Error(d.message||T('請求失敗','请求失败','Request failed'));return d&&Object.prototype.hasOwnProperty.call(d,'data')?d.data:d}
function post(path,body){return api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
function dt(v){const n=Number(v);if(!n)return '—';try{return new Intl.DateTimeFormat(locale()==='en'?'en-US':locale()==='zh-Hans'?'zh-CN':'zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(n))}catch(e){return String(v)}}
function shorten(s,n=70){s=String(s??'');return s.length>n?s.slice(0,n-1)+'…':s}
function j(v,fallback){try{return typeof v==='string'?JSON.parse(v):v??fallback}catch(e){return fallback}}
function game(v){const m={gomoku:T('五子棋','五子棋','Gomoku'),xiangqi:T('象棋','象棋','Xiangqi'),reversi:T('黑白棋','黑白棋','Reversi'),qiguo:T('七國棋','七国棋','Seven Kingdoms')};return m[v]||v||'—'}
function state(v){const m={active:T('正常','正常','Active'),suspended:T('停權','停权','Suspended'),banned:T('封鎖','封禁','Banned'),waiting:T('等待中','等待中','Waiting'),playing:T('進行中','进行中','Playing'),closed:T('已關閉','已关闭','Closed'),pending:T('待處理','待处理','Pending'),in_progress:T('處理中','处理中','In progress'),resolved:T('已處理','已处理','Resolved'),rejected:T('已駁回','已驳回','Rejected'),open:T('待審查','待审查','Open'),reviewed:T('已審查','已审查','Reviewed'),dismissed:T('已忽略','已忽略','Dismissed'),confirmed:T('已確認','已确认','Confirmed'),public:T('公開中','公开中','Public'),admin_only:T('僅後台','仅后台','Admin only'),deleting_soon:T('即將刪除','即将删除','Deleting soon'),deletion_due:T('待刪除','待删除','Deletion due')};return m[v]||v||'—'}
function players(raw){const xs=j(raw,[]);if(!Array.isArray(xs)||!xs.length)return '—';return xs.map(p=>{const side=p.side==='B'?T('黑','黑','Black'):p.side==='W'?T('白','白','White'):p.side||'';return (p.name&&p.name!=='null'?p.name:T('訪客','访客','Guest'))+(side?'（'+side+'）':'')}).join(' vs ')}
function replayResult(raw){const r=j(raw,null);if(!r)return T('無結果','无结果','No result');if(r.adminTerminated)return T('管理員終止／無結果','管理员终止／无结果','Terminated by admin / no result');if(r.winnerName)return T('勝者：','胜者：','Winner: ')+r.winnerName;if(r.winner)return T('勝者：','胜者：','Winner: ')+r.winner;return shorten(r.reason||T('無結果','无结果','No result'),45)}
function th(xs,checkbox=false){return '<thead><tr>'+(checkbox?'<th class="check-col"><input id="selectAllUsers" type="checkbox" aria-label="'+T('全選','全选','Select all')+'"></th>':'')+'<th class="num">#</th>'+xs.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead>'}
function num(i){return '<td class="num">'+(i+1)+'</td>'}
function empty(){return '<div class="empty">'+T('沒有資料','没有数据','No data')+'</div>'}
function setPanel(tab,html,txt=''){title.textContent=label(tab);hint.textContent=txt;out.innerHTML=html}
function label(t){return T(t.h,t.s,t.e)}
function setActive(key){tabsEl.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===key))}
function summary(){return api('/admin/api/summary').then(d=>{const map={users:[T('使用者','用户','Users'),d.users],rooms:[T('房間','房间','Rooms'),d.rooms],replays:[T('回放','回放','Replays'),d.replays],reports:[T('待處理檢舉','待处理举报','Open reports'),d.reports],riskFlags:[T('風險旗標','风险标记','Risk flags'),d.riskFlags]};document.getElementById('summary').innerHTML=Object.values(map).map(x=>'<div class="summary-card"><div class="summary-label">'+esc(x[0])+'</div><div class="summary-value">'+esc(x[1])+'</div></div>').join('')})}
const TABS=[['users','使用者','用户','Users'],['rooms','房間','房间','Rooms'],['replays','回放','回放','Replays'],['reports','檢舉','举报','Reports'],['risk','風險旗標','风险标记','Risk flags'],['announcements','公告','公告','Announcements'],['globalchat','全域聊天室','全局聊天室','Global chat'],['settings','系統設定','系统设置','System settings'],['audit','稽核記錄','审计记录','Audit log']].map(x=>({key:x[0],h:x[1],s:x[2],e:x[3]}));

function modal(opts){
 return new Promise(resolve=>{
  let settled=false;
  const finish=v=>{if(settled)return;settled=true;dlg.close();resolve(v)};
  dlgTitle.textContent=opts.title||T('管理操作','管理操作','Admin action');
  dlgBody.innerHTML=opts.body||'';
  dlgConfirm.textContent=opts.confirmText||T('確認','确认','Confirm');
  dlgConfirm.className=opts.danger?'danger':'';
  dlgCancel.textContent=opts.cancelText||T('取消','取消','Cancel');
  dlgCancel.style.display=opts.closeOnly?'none':'';
  dlgForm.onsubmit=e=>{e.preventDefault();const fd=new FormData(dlgForm);finish(Object.fromEntries(fd.entries()))};
  dlgCancel.onclick=()=>finish(null);dlgX.onclick=()=>finish(null);
  dlg.oncancel=e=>{e.preventDefault();finish(null)};
  dlg.showModal();
  const first=dlg.querySelector('[autofocus]')||dlg.querySelector('input,select,textarea,button');if(first)setTimeout(()=>first.focus(),0);
 })
}
async function messageModal(titleText,message,bad=false,html=false){
 const body='<div class="dialog-message '+(bad?'bad':'')+'">'+(html?message:esc(message))+'</div>';
 await modal({title:titleText,body,confirmText:T('關閉','关闭','Close'),closeOnly:true});
}
async function actionError(e){await messageModal(T('操作失敗','操作失败','Action failed'),e?.message||String(e),true)}

const USER_ACTIONS=[
 ['level_set','設定等級','设置等级','Set level'],
 ['warning','警告','警告','Warning'],
 ['reputation_set','設定信譽','设置信誉','Set reputation'],
 ['gp_delta','增減 GP','增减 GP','Adjust GP'],
 ['gp_zero','GP 歸零','GP 归零','Reset GP'],
 ['suspend','暫時停權','暂时停权','Suspend'],
 ['ban','永久封鎖','永久封禁','Ban'],
 ['restore','恢復帳號','恢复账号','Restore'],
 ['revoke_sessions','撤銷所有登入','撤销所有登录','Revoke sessions'],
 ['confirmed_cheating','確認作弊處分','确认作弊处分','Confirmed cheating']
];
function userActionLabel(a){const x=USER_ACTIONS.find(v=>v[0]===a);return x?T(x[1],x[2],x[3]):a}
function actionValueHtml(action){
 if(action==='level_set')return '<div class="dialog-field"><span>'+T('等級','等级','Level')+'</span><select name="value"><option value="1">Lv.1</option><option value="2">Lv.2</option><option value="3">Lv.3</option><option value="4">Lv.4</option><option value="5">Lv.5</option></select></div>';
 if(action==='reputation_set')return '<div class="dialog-field"><span>'+T('信譽 0～100','信誉 0～100','Reputation 0–100')+'</span><input name="value" type="number" min="0" max="100" value="100" required></div>';
 if(action==='gp_delta')return '<div class="dialog-field"><span>'+T('GP 增減值','GP 增减值','GP delta')+'</span><input name="value" type="number" value="0" required></div>';
 if(action==='suspend')return '<div class="dialog-field"><span>'+T('停權天數','停权天数','Suspend days')+'</span><input name="days" type="number" min="1" max="3650" value="7" required></div>';
 if(action==='confirmed_cheating')return '<div class="dialog-field"><span>'+T('停權天數','停权天数','Suspend days')+'</span><select name="days"><option value="1">1</option><option value="7" selected>7</option><option value="30">30</option></select><div class="action-hint">'+T('同時套用 Reputation 0 / GP 0 / Lv.1。','同时应用 Reputation 0 / GP 0 / Lv.1。','Also applies Reputation 0 / GP 0 / Lv.1.')+'</div></div>';
 return '';
}
async function manageUsers(usernames){
 if(!usernames.length)return;
 const options=USER_ACTIONS.map(x=>'<option value="'+x[0]+'">'+esc(T(x[1],x[2],x[3]))+'</option>').join('');
 const body='<div class="dialog-grid"><div class="dialog-field wide"><span>'+T('目標使用者','目标用户','Target users')+'</span><div class="dialog-targets">'+usernames.map(esc).join('<br>')+'</div></div><div class="dialog-field"><span>'+T('動作','操作','Action')+'</span><select id="dlgUserAction" name="action" autofocus>'+options+'</select></div><div id="dlgUserValue"></div><div class="dialog-field wide"><span>'+T('原因','原因','Reason')+'</span><textarea name="reason" required></textarea></div></div>';
 const form=modal({title:usernames.length>1?T('批量管理使用者','批量管理用户','Bulk manage users'):T('管理使用者','管理用户','Manage user'),body,confirmText:T('套用','应用','Apply'),danger:false});
 setTimeout(()=>{const sel=document.getElementById('dlgUserAction'),slot=document.getElementById('dlgUserValue');const sync=()=>{slot.innerHTML=actionValueHtml(sel.value)};sel.onchange=sync;sync()},0);
 const values=await form;if(!values)return;
 try{
  const payload={usernames,action:values.action,reason:values.reason};
  if(values.value!==undefined)payload.value=values.value;
  if(values.days!==undefined)payload.days=values.days;
  const d=await post('/admin/api/users/bulk-discipline',payload);
  const lines=d.results.map(r=>(r.ok?'✓ ':'✗ ')+r.username+(r.ok?'':' — '+r.message));
  await messageModal(T('操作結果','操作结果','Results'),T('成功','成功','Succeeded')+' '+d.succeeded+' / '+d.total+'<ul class="dialog-result-list">'+lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>',d.failed>0,true);
  return d;
 }catch(e){await actionError(e)}
}
async function createUserModal(){
 const values=await modal({title:T('建立帳號','建立账号','Create account'),body:'<div class="dialog-grid"><div class="dialog-field"><span>'+T('使用者名稱','用户名','Username')+'</span><input name="username" autofocus required></div><div class="dialog-field"><span>Email</span><input name="email" type="email" required></div></div>',confirmText:T('建立啟用連結','建立启用链接','Create activation link')});
 if(!values)return;
 try{const d=await post('/admin/api/user/activation',values);const link=location.origin+'/activate?token='+d.token;await messageModal(T('啟用連結','启用链接','Activation link'),'<p>'+T('請將此連結交給使用者：','请将此链接交给用户：','Give this link to the user:')+'</p><p><code>'+esc(link)+'</code></p>',false,true)}catch(e){await actionError(e)}
}

async function renderUsers(tab,q=''){
 setPanel(tab,'<div class="toolbar"><input id="userSearch" placeholder="'+T('搜尋使用者名稱','搜索用户名','Search username')+'" value="'+esc(q)+'"><button id="userSearchBtn">'+T('搜尋','搜索','Search')+'</button><span class="spacer"></span><span id="selectionCount" class="selection-count">'+T('已選 0 位','已选 0 位','0 selected')+'</span><button id="bulkManageBtn" disabled>'+T('批量管理','批量管理','Bulk manage')+'</button><button id="createUserBtn" class="secondary">'+T('建立帳號','建立账号','Create account')+'</button></div><div id="userTable"></div>',T('勾選多位可批量操作；單筆管理按鈕與使用者同一列。','勾选多位可批量操作；单笔管理按钮与用户同一行。','Select multiple users for bulk actions; each row also has a Manage button.'));
 try{
  const rows=await api('/admin/api/users'+(q?'?q='+encodeURIComponent(q):''));
  document.getElementById('userTable').innerHTML=rows.length?'<table>'+th([T('使用者名稱','用户名','Username'),'Email',T('狀態','状态','Status'),T('等級','等级','Level'),'GP',T('信譽','信誉','Reputation'),T('操作','操作','Action')],true)+'<tbody>'+rows.map((r,i)=>'<tr><td class="check-col"><input type="checkbox" data-user-check value="'+esc(r.username_display)+'" aria-label="'+esc(r.username_display)+'"></td>'+num(i)+'<td><strong>'+esc(r.username_display)+'</strong></td><td>'+esc(r.email_normalized)+'</td><td>'+esc(state(r.status))+'</td><td>Lv.'+esc(r.level)+'</td><td>'+esc(r.gp)+'</td><td>'+esc(r.reputation)+'</td><td><button data-user-manage="'+esc(r.username_display)+'">'+T('管理','管理','Manage')+'</button></td></tr>').join('')+'</tbody></table>':empty();
  const checks=[...document.querySelectorAll('[data-user-check]')],all=document.getElementById('selectAllUsers'),bulk=document.getElementById('bulkManageBtn'),count=document.getElementById('selectionCount');
  const selected=()=>checks.filter(c=>c.checked).map(c=>c.value);
  const sync=()=>{const n=selected().length;count.textContent=T('已選 ','已选 ','')+n+T(' 位',' 位',' selected');bulk.disabled=!n;if(all)all.checked=checks.length>0&&n===checks.length;if(all)all.indeterminate=n>0&&n<checks.length};
  checks.forEach(c=>c.onchange=sync);if(all)all.onchange=()=>{checks.forEach(c=>c.checked=all.checked);sync()};
  bulk.onclick=async()=>{const names=selected();if(await manageUsers(names))await renderUsers(tab,q)};
  document.querySelectorAll('[data-user-manage]').forEach(b=>b.onclick=async()=>{if(await manageUsers([b.dataset.userManage]))await renderUsers(tab,q)});
  sync();
 }catch(e){document.getElementById('userTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
 document.getElementById('userSearchBtn').onclick=()=>renderUsers(tab,document.getElementById('userSearch').value.trim());
 document.getElementById('createUserBtn').onclick=createUserModal;
}

async function reasonAction(opts){
 const values=await modal({title:opts.title,body:'<div class="dialog-field"><span>'+T('原因','原因','Reason')+'</span><textarea name="reason" autofocus required></textarea></div>',confirmText:opts.confirmText,danger:!!opts.danger});
 if(!values)return false;
 try{await post(opts.path,{...opts.payload,reason:values.reason});return true}catch(e){await actionError(e);return false}
}
async function renderRooms(tab){
 setPanel(tab,'<div id="roomTable"></div>',T('終止遊戲與關閉房間直接在每列操作。','终止游戏与关闭房间直接在每行操作。','Terminate or close directly from each room row.'));
 try{const rows=await api('/admin/api/rooms');document.getElementById('roomTable').innerHTML=rows.length?'<table>'+th([T('房號','房号','Room'),T('名稱','名称','Name'),T('棋類','棋类','Game'),T('狀態','状态','Status'),T('玩家','玩家','Players'),T('觀戰','观战','Spectators'),T('最後活動','最后活动','Last active'),T('操作','操作','Actions')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td class="nowrap"><strong>'+esc(r.room_id)+'</strong></td><td>'+esc(r.room_name||'—')+'</td><td>'+esc(game(r.game_type))+'</td><td>'+esc(state(r.status))+'</td><td>'+esc(players(r.players_json))+'</td><td>'+esc(r.spectator_count||0)+'</td><td class="nowrap">'+esc(dt(r.last_activity_at))+'</td><td><div class="row-actions"><button data-room-action="terminate" data-room="'+esc(r.room_id)+'">'+T('終止遊戲','终止游戏','Terminate')+'</button><button class="danger" data-room-action="close" data-room="'+esc(r.room_id)+'">'+T('關閉房間','关闭房间','Close')+'</button></div></td></tr>').join('')+'</tbody></table>':empty();
 document.querySelectorAll('[data-room-action]').forEach(b=>b.onclick=async()=>{const close=b.dataset.roomAction==='close';const ok=await reasonAction({title:close?T('關閉房間','关闭房间','Close room'):T('終止目前遊戲','终止当前游戏','Terminate game'),confirmText:close?T('關閉房間','关闭房间','Close room'):T('終止遊戲','终止游戏','Terminate'),danger:close,path:close?'/admin/api/room/close':'/admin/api/room/terminate-game',payload:{roomId:b.dataset.room}});if(ok){await renderRooms(tab);summary()}});
 }catch(e){document.getElementById('roomTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function renderReplays(tab){
 setPanel(tab,'<div id="replayTable"></div>',T('只顯示對局重點；內部回放 UUID 與原始 JSON 已隱藏。','只显示对局重点；内部回放 UUID 与原始 JSON 已隐藏。','Only useful match details are shown; internal replay UUID/JSON are hidden.'));
 try{const rows=await api('/admin/api/replays?limit=20');document.getElementById('replayTable').innerHTML=rows.length?'<table>'+th([T('房號','房号','Room'),T('棋類','棋类','Game'),T('玩家','玩家','Players'),T('結果','结果','Result'),T('完成時間','完成时间','Finished'),T('狀態','状态','Status'),T('操作','操作','Actions')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td>'+esc(r.room_id)+'</td><td>'+esc(game(r.game_type))+'</td><td>'+esc(players(r.players_json))+'</td><td>'+esc(replayResult(r.result_json))+'</td><td class="nowrap">'+esc(dt(r.finished_at))+'</td><td>'+esc(state(r.lifecycle))+'</td><td><div class="row-actions"><button data-replay-view="'+esc(r.id)+'">'+T('開啟','打开','Open')+'</button><button class="secondary" data-replay-download="'+esc(r.id)+'">'+T('下載','下载','Download')+'</button></div></td></tr>').join('')+'</tbody></table>':empty();document.querySelectorAll('[data-replay-view]').forEach(b=>b.onclick=()=>location.href='/admin/replay/'+encodeURIComponent(b.dataset.replayView));document.querySelectorAll('[data-replay-download]').forEach(b=>b.onclick=()=>location.href='/admin/replay/'+encodeURIComponent(b.dataset.replayDownload)+'/download')}catch(e){document.getElementById('replayTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function renderReports(tab){
 setPanel(tab,'<div id="reportTable"></div>',T('直接從檢舉列開啟管理視窗，不需要輸入檢舉 ID。','直接从举报行打开管理窗口，不需要输入举报 ID。','Open the management dialog from each row; no report ID entry needed.'));
 try{const rows=await api('/admin/api/reports');document.getElementById('reportTable').innerHTML=rows.length?'<table>'+th([T('類型','类型','Type'),T('內容','内容','Description'),T('房號','房号','Room'),T('狀態','状态','Status'),T('時間','时间','Time'),T('操作','操作','Action')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td>'+esc(r.type||'—')+'</td><td>'+esc(shorten(r.description||r.content||'',90))+'</td><td>'+esc(r.room_id||'—')+'</td><td>'+esc(state(r.status))+'</td><td class="nowrap">'+esc(dt(r.created_at))+'</td><td><button data-report-manage="'+esc(r.id)+'">'+T('管理','管理','Manage')+'</button></td></tr>').join('')+'</tbody></table>':empty();
 document.querySelectorAll('[data-report-manage]').forEach(b=>b.onclick=async()=>{const v=await modal({title:T('處理檢舉','处理举报','Manage report'),body:'<div class="dialog-grid"><div class="dialog-field"><span>'+T('狀態','状态','Status')+'</span><select name="status" autofocus><option value="resolved">'+T('已處理','已处理','Resolved')+'</option><option value="in_progress">'+T('處理中','处理中','In progress')+'</option><option value="rejected">'+T('駁回','驳回','Rejected')+'</option></select></div><div class="dialog-field wide"><span>'+T('備註','备注','Note')+'</span><textarea name="note"></textarea></div></div>',confirmText:T('更新','更新','Update')});if(!v)return;try{await post('/admin/api/report',{id:b.dataset.reportManage,status:v.status,note:v.note||v.status});await renderReports(tab);summary()}catch(e){await actionError(e)}})
 }catch(e){document.getElementById('reportTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function renderRisk(tab){
 setPanel(tab,'<div id="riskTable"></div>',T('只顯示風險摘要；詳細 evidence JSON 預設隱藏。','只显示风险摘要；详细 evidence JSON 默认隐藏。','Only risk summaries are shown; raw evidence JSON is hidden.'));
 try{const rows=await api('/admin/api/risk');document.getElementById('riskTable').innerHTML=rows.length?'<table>'+th([T('類型','类型','Type'),T('程度','程度','Severity'),T('狀態','状态','Status'),T('時間','时间','Time'),T('操作','操作','Action')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td>'+esc(r.type||'—')+'</td><td>'+esc(r.severity_hint||'—')+'</td><td>'+esc(state(r.status))+'</td><td>'+esc(dt(r.created_at))+'</td><td><button data-risk-manage="'+esc(r.id)+'">'+T('管理','管理','Manage')+'</button></td></tr>').join('')+'</tbody></table>':empty();
 document.querySelectorAll('[data-risk-manage]').forEach(b=>b.onclick=async()=>{const v=await modal({title:T('審查風險旗標','审查风险标记','Review risk flag'),body:'<div class="dialog-field"><span>'+T('結果','结果','Result')+'</span><select name="status" autofocus><option value="reviewed">'+T('已審查','已审查','Reviewed')+'</option><option value="dismissed">'+T('忽略','忽略','Dismissed')+'</option><option value="confirmed">'+T('確認風險','确认风险','Confirmed')+'</option></select></div>',confirmText:T('更新','更新','Update')});if(!v)return;try{await post('/admin/api/risk/review',{id:b.dataset.riskManage,status:v.status});await renderRisk(tab);summary()}catch(e){await actionError(e)}})
 }catch(e){document.getElementById('riskTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function announcementModal(row){
 const v=await modal({title:row?T('編輯公告','编辑公告','Edit announcement'):T('新增公告','新增公告','New announcement'),body:'<div class="dialog-grid"><input type="hidden" name="id" value="'+esc(row?.id||'')+'"><div class="dialog-field"><span>'+T('標題','标题','Title')+'</span><input name="title" value="'+esc(row?.title||'')+'" autofocus required></div><div class="dialog-field"><span>'+T('類型','类型','Type')+'</span><select name="type"><option value="normal"'+((row?.type||'normal')==='normal'?' selected':'')+'>Normal</option><option value="important"'+(row?.type==='important'?' selected':'')+'>Important</option><option value="maintenance"'+(row?.type==='maintenance'?' selected':'')+'>Maintenance</option></select></div><div class="dialog-field wide"><span>'+T('內容','内容','Content')+'</span><textarea name="content" required>'+esc(row?.content||'')+'</textarea></div><div class="dialog-field"><span>'+T('啟用','启用','Enabled')+'</span><select name="enabled"><option value="true"'+(row?.enabled!==0&&row?.enabled!==false?' selected':'')+'>'+T('啟用','启用','Enabled')+'</option><option value="false"'+(row?.enabled===0||row?.enabled===false?' selected':'')+'>'+T('停用','停用','Disabled')+'</option></select></div></div>',confirmText:T('儲存','保存','Save')});
 if(!v)return false;v.enabled=v.enabled==='true';v.id=v.id||null;v.expiresAt=null;try{await post('/admin/api/announcement',v);return true}catch(e){await actionError(e);return false}
}
async function renderAnnouncements(tab){
 setPanel(tab,'<div class="toolbar"><span class="spacer"></span><button id="newAnnouncement">'+T('新增公告','新增公告','New announcement')+'</button></div><div id="announcementTable"></div>');
 try{const rows=await api('/admin/api/announcements');document.getElementById('announcementTable').innerHTML=rows.length?'<table>'+th([T('標題','标题','Title'),T('類型','类型','Type'),T('啟用','启用','Enabled'),T('發布時間','发布时间','Published'),T('操作','操作','Action')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td>'+esc(r.title)+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.enabled?T('是','是','Yes'):T('否','否','No'))+'</td><td>'+esc(dt(r.published_at))+'</td><td><button data-ann-edit="'+i+'">'+T('編輯','编辑','Edit')+'</button></td></tr>').join('')+'</tbody></table>':empty();
 document.querySelectorAll('[data-ann-edit]').forEach(b=>b.onclick=async()=>{if(await announcementModal(rows[Number(b.dataset.annEdit)]))await renderAnnouncements(tab)});
 document.getElementById('newAnnouncement').onclick=async()=>{if(await announcementModal(null))await renderAnnouncements(tab)}
 }catch(e){document.getElementById('announcementTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function chatSettingsModal(data){
 const v=await modal({title:T('聊天室設定','聊天室设置','Chat settings'),body:'<div class="dialog-grid"><div class="dialog-field"><span>'+T('啟用聊天室','启用聊天室','Chat enabled')+'</span><select name="enabled"><option value="true"'+(data.enabled?' selected':'')+'>'+T('啟用','启用','Enabled')+'</option><option value="false"'+(!data.enabled?' selected':'')+'>'+T('停用','停用','Disabled')+'</option></select></div><div class="dialog-field"><span>'+T('慢速模式（毫秒）','慢速模式（毫秒）','Slow mode (ms)')+'</span><input name="slowMs" type="number" min="1200" value="'+esc(data.slowMs||5000)+'"></div><div class="dialog-field wide"><span>'+T('修改原因','修改原因','Reason')+'</span><textarea name="reason" required></textarea></div></div>',confirmText:T('儲存','保存','Save')});
 if(!v)return false;try{await post('/admin/api/settings',{key:'global_chat_enabled',value:v.enabled==='true',reason:v.reason});await post('/admin/api/settings',{key:'global_chat_slow_ms',value:Number(v.slowMs)||5000,reason:v.reason});return true}catch(e){await actionError(e);return false}
}
async function renderChat(tab){
 setPanel(tab,'<div class="toolbar"><div id="chatStatus" class="note"></div><span class="spacer"></span><button id="chatSettingsBtn">'+T('聊天室設定','聊天室设置','Chat settings')+'</button></div><div id="chatTable"></div>',T('使用者／訪客只顯示名稱；內部 senderId 已隱藏。','用户／访客只显示名称；内部 senderId 已隐藏。','Users and guests are shown by name; sender IDs are hidden.'));
 try{const d=await api('/admin/api/global-chat');document.getElementById('chatStatus').textContent=T('連線數：','连接数：','Connections: ')+(d.connections||0)+' · '+T('慢速模式：','慢速模式：','Slow mode: ')+d.slowMs+' ms';const rows=Array.isArray(d.messages)?d.messages:[];
 document.getElementById('chatTable').innerHTML=rows.length?'<table>'+th([T('名稱','名称','Name'),T('身分','身份','Kind'),T('訊息','消息','Message'),T('時間','时间','Time'),T('操作','操作','Actions')])+'<tbody>'+rows.map((m,i)=>'<tr>'+num(i)+'<td><strong>'+esc(m.name||T('訪客','访客','Guest'))+'</strong></td><td>'+esc(m.senderKind==='user'?T('使用者','用户','User'):T('訪客','访客','Guest'))+'</td><td>'+esc(shorten(m.text,120))+'</td><td>'+esc(dt(m.at))+'</td><td><div class="row-actions"><button data-chat-mute="'+i+'">'+T('禁言','禁言','Mute')+'</button><button class="danger" data-chat-delete="'+esc(m.id)+'">'+T('刪除','删除','Delete')+'</button></div></td></tr>').join('')+'</tbody></table>':empty();
 document.querySelectorAll('[data-chat-delete]').forEach(b=>b.onclick=async()=>{const v=await modal({title:T('刪除聊天室訊息','删除聊天室消息','Delete chat message'),body:'<div class="dialog-field"><span>'+T('原因','原因','Reason')+'</span><textarea name="reason" autofocus required></textarea></div>',confirmText:T('刪除','删除','Delete'),danger:true});if(!v)return;try{await post('/admin/api/global-chat/delete',{id:b.dataset.chatDelete,reason:v.reason});await renderChat(tab)}catch(e){await actionError(e)}});
 document.querySelectorAll('[data-chat-mute]').forEach(b=>b.onclick=async()=>{const m=rows[Number(b.dataset.chatMute)];const v=await modal({title:T('禁言 ','禁言 ','Mute ')+(m.name||T('訪客','访客','Guest')),body:'<div class="dialog-grid"><div class="dialog-field"><span>'+T('時間','时间','Duration')+'</span><select name="minutes" autofocus><option value="30">30 '+T('分鐘','分钟','minutes')+'</option><option value="60">1 '+T('小時','小时','hour')+'</option><option value="1440">1 '+T('天','天','day')+'</option><option value="10080">7 '+T('天','天','days')+'</option></select></div><div class="dialog-field wide"><span>'+T('原因','原因','Reason')+'</span><textarea name="reason" required></textarea></div></div>',confirmText:T('禁言','禁言','Mute')});if(!v)return;try{await post('/admin/api/global-chat/mute',{subjectType:m.senderKind==='user'?'user':'guest',subjectId:m.senderId,subjectName:m.name,mutedUntil:Date.now()+Number(v.minutes)*60000,reason:v.reason});await renderChat(tab)}catch(e){await actionError(e)}});
 document.getElementById('chatSettingsBtn').onclick=async()=>{if(await chatSettingsModal(d))await renderChat(tab)}
 }catch(e){out.innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function renderSettings(tab){
 setPanel(tab,'<div class="toolbar"><button id="maintenanceBtn">'+T('修改維護模式','修改维护模式','Change maintenance mode')+'</button></div><p class="muted">'+T('其他聊天室設定已放在「全域聊天室」。','其他聊天室设置已放在“全局聊天室”。','Chat settings are managed under Global chat.')+'</p>');
 document.getElementById('maintenanceBtn').onclick=async()=>{const v=await modal({title:T('維護模式','维护模式','Maintenance mode'),body:'<div class="dialog-grid"><div class="dialog-field"><span>'+T('狀態','状态','State')+'</span><select name="value" autofocus><option value="false">'+T('關閉','关闭','Off')+'</option><option value="true">'+T('開啟','开启','On')+'</option></select></div><div class="dialog-field wide"><span>'+T('修改原因','修改原因','Reason')+'</span><textarea name="reason" required></textarea></div></div>',confirmText:T('儲存','保存','Save')});if(!v)return;try{await post('/admin/api/settings',{key:'maintenance_mode',value:v.value==='true',reason:v.reason});await messageModal(T('已儲存','已保存','Saved'),T('系統設定已更新。','系统设置已更新。','System setting updated.'))}catch(e){await actionError(e)}}
}

async function renderAudit(tab){
 setPanel(tab,'<div id="auditTable"></div>',T('只顯示誰做了什麼、對誰、原因與時間。','只显示谁做了什么、对谁、原因和时间。','Shows actor, action, target, reason, and time only.'));
 try{const rows=await api('/admin/api/audit');document.getElementById('auditTable').innerHTML=rows.length?'<table>'+th([T('管理員','管理员','Admin'),T('動作','动作','Action'),T('目標','目标','Target'),T('原因','原因','Reason'),T('時間','时间','Time')])+'<tbody>'+rows.map((r,i)=>'<tr>'+num(i)+'<td>'+esc(r.admin_actor)+'</td><td>'+esc(r.action_type)+'</td><td>'+esc(r.target_type||'—')+'</td><td>'+esc(shorten(r.reason||'',90))+'</td><td>'+esc(dt(r.created_at))+'</td></tr>').join('')+'</tbody></table>':empty()}catch(e){document.getElementById('auditTable').innerHTML='<p class="bad">'+esc(e.message)+'</p>'}
}

async function openTab(key){const tab=TABS.find(x=>x.key===key)||TABS[0];setActive(tab.key);if(tab.key==='users')return renderUsers(tab);if(tab.key==='rooms')return renderRooms(tab);if(tab.key==='replays')return renderReplays(tab);if(tab.key==='reports')return renderReports(tab);if(tab.key==='risk')return renderRisk(tab);if(tab.key==='announcements')return renderAnnouncements(tab);if(tab.key==='globalchat')return renderChat(tab);if(tab.key==='settings')return renderSettings(tab);return renderAudit(tab)}
tabsEl.innerHTML=TABS.map(t=>'<button type="button" role="tab" data-tab="'+t.key+'">'+esc(label(t))+'</button>').join('');tabsEl.querySelectorAll('button').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));summary().catch(()=>{});openTab('users');
`);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
