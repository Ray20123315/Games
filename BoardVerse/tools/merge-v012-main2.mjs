import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const one=(s,re,repl,label)=>{const hits=[...s.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];if(hits.length!==1)throw new Error(label+': expected 1 hit, got '+hits.length);return s.replace(re,repl)};

{
  const p='src/admin/api.js';let s=read(p);
  s=s.replace('const LIMIT = 20;','const LIMIT = 50;');
  if(!s.includes('const ROOM_ACTIONS = Object.freeze')){
    const marker='export async function adminApi({ db, env, request, path, url, actor }) {';
    const helpers=String.raw`const ROOM_ACTIONS = Object.freeze({
  pause: { path: "/admin/pause-room", audit: "room.pause" },
  resume: { path: "/admin/resume-room", audit: "room.resume" },
  terminate: { path: "/admin/terminate-game", audit: "room.terminate_game" },
  close: { path: "/admin/close-room", audit: "room.close" },
});
function roomIdValue(value) {
  const roomId=String(value||"").trim().toUpperCase();
  if(!ROOM_CODE_RE.test(roomId)) throw new HttpError(400,"room_invalid","房號格式錯誤："+(roomId||"(空白)"));
  return roomId;
}
async function invokeRoomAction(env, roomId, action, reason) {
  const spec=ROOM_ACTIONS[action];
  if(!spec) throw new HttpError(400,"room_action_invalid","不支援的房間操作。");
  if(!env?.ROOMS) throw new HttpError(503,"rooms_unavailable","ROOMS Durable Object 尚未綁定。");
  const res=await env.ROOMS.getByName(roomId).fetch(new Request("https://boardverse.internal"+spec.path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})}));
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(res.status,"room_action_failed",data.message||"房間操作失敗。");
  return data;
}
async function auditedRoomAction(db, env, actor, roomId, action, reason) {
  const data=await invokeRoomAction(env,roomId,action,reason);
  await audit(db,ROOM_ACTIONS[action].audit,{adminActor:actor,targetType:"room",targetId:roomId,reason,after:{action,...data}});
  return {roomId,ok:true,...data};
}
async function roomLiveState(env,row) {
  if(!env?.ROOMS || row.status==="closed") return {...row,admin_paused:false,admin_paused_at:null};
  try {
    const res=await env.ROOMS.getByName(row.room_id).fetch("https://boardverse.internal/admin/state");
    if(!res.ok) return {...row,admin_paused:false,admin_paused_at:null};
    const state=await res.json();
    return {...row,admin_paused:!!state.paused,admin_paused_at:state.pausedAt||null,live_status:state.status||row.status,live_closed:!!state.closed};
  } catch { return {...row,admin_paused:false,admin_paused_at:null}; }
}

`;
    if(!s.includes(marker))throw new Error('adminApi marker missing');
    s=s.replace(marker,helpers+marker);
  }
  s=one(s,/  if \(path === "\/admin\/api\/rooms" && request\.method === "GET"\) \{[\s\S]*?\n  \}\n\n  if \(path === "\/admin\/api\/room\/terminate-game"/,String.raw`  if (path === "/admin/api/rooms" && request.method === "GET") {
    const rows=await all(db,"SELECT * FROM active_rooms ORDER BY last_activity_at DESC LIMIT ?",LIMIT);
    return Promise.all(rows.map((row)=>roomLiveState(env,row)));
  }
  if (path === "/admin/api/rooms/batch" && request.method === "POST") {
    const b=await request.json(), action=String(b.action||"");
    if(!ROOM_ACTIONS[action]) throw new HttpError(400,"room_action_invalid","批量房間操作不合法。");
    const reason=cleanReason(b.reason), raw=Array.isArray(b.roomIds)?b.roomIds:[];
    const roomIds=[...new Set(raw.map((id)=>roomIdValue(id)))];
    if(!roomIds.length) throw new HttpError(400,"room_ids_required","請至少選擇一個房間。");
    if(roomIds.length>LIMIT) throw new HttpError(400,"room_ids_limit","一次最多操作 "+LIMIT+" 個房間。");
    const results=await Promise.all(roomIds.map(async(roomId)=>{try{return await auditedRoomAction(db,env,actor,roomId,action,reason)}catch(error){return{roomId,ok:false,code:error?.code||"room_action_failed",message:error?.message||"操作失敗。"}}}));
    return {ok:results.every((x)=>x.ok),action,requested:roomIds.length,succeeded:results.filter((x)=>x.ok).length,failed:results.filter((x)=>!x.ok).length,results};
  }
  if (path === "/admin/api/room/pause" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"pause",cleanReason(b.reason));
  }
  if (path === "/admin/api/room/resume" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"resume",cleanReason(b.reason));
  }

  if (path === "/admin/api/room/terminate-game"`,'rooms API');
  s=one(s,/  if \(path === "\/admin\/api\/room\/terminate-game" && request\.method === "POST"\) \{[\s\S]*?\n  \}\n\n  if \(path === "\/admin\/api\/room\/close"/,String.raw`  if (path === "/admin/api/room/terminate-game" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"terminate",cleanReason(b.reason));
  }

  if (path === "/admin/api/room/close"`,'terminate API');
  s=one(s,/  if \(path === "\/admin\/api\/room\/close" && request\.method === "POST"\) \{[\s\S]*?\n  \}\n\n  if \(path === "\/admin\/api\/replays"/,String.raw`  if (path === "/admin/api/room/close" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"close",cleanReason(b.reason));
  }

  if (path === "/admin/api/replays"`,'close API');
  write(p,s);
}

{
  const p='src/ui/feature-policy.js';let s=read(p);
  s=s.replace('if(hint)hint.textContent=voiceHintText();','if(hint&&hint.textContent!==voiceHintText())hint.textContent=voiceHintText();');
  s=one(s,/function boot\(\)\{checkAuth\(\);syncCreateVoice\(\);var o=new MutationObserver\(syncCreateVoice\);o\.observe\(document\.body,\{childList:true,subtree:true\}\);document\.addEventListener\('change',function\(e\)\{if\(e\.target&&e\.target\.id==='gameId'\)setTimeout\(syncCreateVoice,0\)\},true\)\}/,"function boot(){checkAuth();syncCreateVoice();setTimeout(syncCreateVoice,0);document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}\nwindow.addEventListener('boardverse:create-extras-mounted',function(){syncCreateVoice()});",'feature-policy observer');
  write(p,s);
}

{
  const p='src/admin/workbench.js';let s=read(p);
  const replacement=String.raw`var userRows=[],userSelected=new Set();
function userActions(){return [["warning","warning"],["reputation_set","reputation_set"],["gp_delta","gp_delta"],["gp_zero","gp_zero"],["level_set","level_set"],["suspend","suspend"],["ban","ban"],["restore","restore"],["revoke_sessions","revoke_sessions"],["custom_room_suspend","custom_room_suspend"],["custom_room_restore","custom_room_restore"],["unlimited_custom_room","unlimited_custom_room"],["mute_global","mute_global"],["mute_room","mute_room"],["mute_all_chat","mute_all_chat"],["confirmed_cheating","confirmed_cheating"]]}
function userHtml(rows){userRows=rows||[];var body=userRows.map(function(r){var name=r.username_display||r.username||r.id,sel=userSelected.has(name);return '<tr><td><button class="room-check" aria-label="選擇 '+esc(name)+'" aria-checked="'+(sel?'true':'false')+'" data-user-check="'+esc(name)+'"></button></td><td><strong>'+esc(name)+'</strong></td><td>'+esc(r.email_normalized||'—')+'</td><td>'+esc(r.status||'—')+'</td><td>Lv.'+esc(r.level||1)+'</td><td>'+esc(r.gp||0)+'</td><td>'+esc(r.reputation??'—')+'</td><td><button class="btn" data-user-manage="'+esc(name)+'">管理</button></td></tr>'}).join('');return '<div class="table-wrap"><table><thead><tr><th>選擇</th><th>帳號</th><th>Email</th><th>狀態</th><th>等級</th><th>GP</th><th>信譽</th><th>操作</th></tr></thead><tbody>'+body+'</tbody></table></div>'}
function syncUserButtons(){var n=userSelected.size,c=$('userSelectedCount'),b=$('bulkUserApply');if(c)c.textContent=n+' 已選';if(b)b.disabled=n===0}
function bindUserRows(){document.querySelectorAll('[data-user-check]').forEach(function(b){b.onclick=function(){var name=b.dataset.userCheck;if(userSelected.has(name))userSelected.delete(name);else userSelected.add(name);loadUsers($('userQuery')?$('userQuery').value:'')}});document.querySelectorAll('[data-user-manage]').forEach(function(b){b.onclick=function(){userSelected.clear();userSelected.add(b.dataset.userManage);syncUserButtons();if($('disciplineReason'))$('disciplineReason').focus()}});syncUserButtons()}
function applyBulkUsers(){var names=Array.from(userSelected),action=$('disciplineAction').value,reason=String($('disciplineReason').value||'').trim(),raw=String($('disciplineValue').value||'').trim();if(!names.length)return notify('請先選擇帳號',true);if(!reason){$('disciplineReason').focus();return notify('帳號操作必須填寫原因',true)}var body={usernames:names,action:action,reason:reason};if(action==='suspend'||action==='confirmed_cheating')body.days=Math.max(1,Number(raw)||7);else if(raw!=='')body.value=Number.isNaN(Number(raw))?raw:Number(raw);post('/admin/api/users/bulk-discipline',body).then(function(d){setResult('帳號操作完成：成功 '+d.succeeded+'，失敗 '+d.failed,d.failed>0);if(d.failed)notify(d.results.filter(function(x){return!x.ok}).map(function(x){return x.username+': '+x.message}).join('；'),true);else notify('已完成 '+d.succeeded+' 位帳號');userSelected.clear();loadUsers($('userQuery').value);loadSummary()}).catch(function(e){notify(e.message,true)})}
function toolsUsers(){tools.innerHTML='<div class="tool-card"><h3>帳號搜尋</h3>'+field('Username / Email',input('userQuery','搜尋帳號'))+btn('userSearch','搜尋','gold')+'</div><div class="tool-card"><h3>帳號管理</h3><p id="userSelectedCount">0 已選</p>'+field('Action',select('disciplineAction',userActions()))+field('值 / 天數',input('disciplineValue','依 action 填寫'))+field('原因',input('disciplineReason','必填'))+btn('bulkUserApply','套用到所選帳號','danger')+'</div><div class="tool-card"><h3>管理員建立帳號</h3>'+field('Username',input('activationUsername','Username'))+field('Email',input('activationEmail','Email','', 'email'))+btn('activationCreate','建立一次性啟用連結','gold')+'</div>';bindUserTools()}
function bindUserTools(){$('userSearch').onclick=function(){loadUsers($('userQuery').value)};$('bulkUserApply').onclick=applyBulkUsers;$('activationCreate').onclick=function(){post('/admin/api/user/activation',{username:$('activationUsername').value,email:$('activationEmail').value}).then(function(d){var url=location.origin+'/activate?token='+d.token;setResult('一次性啟用連結：'+url,false);navigator.clipboard&&navigator.clipboard.writeText(url).catch(function(){});notify('啟用連結已建立並嘗試複製')}).catch(function(e){notify(e.message,true)})};syncUserButtons()}
function loadUsers(q){out.innerHTML='<div class="loading">載入帳號…</div>';api('/admin/api/users'+(q?'?q='+encodeURIComponent(q):'')).then(function(rows){out.innerHTML=userHtml(rows);bindUserRows()}).catch(function(e){out.innerHTML='<div class="empty">'+esc(e.message)+'</div>')}
function toolsReplay`;
  s=one(s,/function toolsUsers\(\)\{[\s\S]*?function toolsReplay/,replacement,'workbench user tools');
  write(p,s);
}

{
  const p='test/feature-policy.test.mjs';
  write(p,`import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nconst entry=await readFile(new URL("../src/index-v011.js",import.meta.url),"utf8");\nconst policy=await readFile(new URL("../src/ui/feature-policy.js",import.meta.url),"utf8");\nconst adminApi=await readFile(new URL("../src/admin/api.js",import.meta.url),"utf8");\nconst workbench=await readFile(new URL("../src/admin/workbench.js",import.meta.url),"utf8");\nassert.match(entry,/feature\\.canReady = feature\\.myRole === "player" && feature\\.status === "waiting"/);\nassert.match(entry,/voiceLoginRequired/);\nassert.match(entry,/room_admin_paused/);\nassert.match(entry,/FEATURE_POLICY_SCRIPT/);\nassert.match(policy,/\\/api\\/voice-entitlement/);\nassert.doesNotMatch(policy,/new MutationObserver/);\nassert.match(policy,/boardverse:create-extras-mounted/);\nassert.match(adminApi,/const MAX_BULK_USERS = 20/);\nassert.match(adminApi,/\\/admin\\/api\\/users\\/bulk-discipline/);\nassert.match(adminApi,/\\/admin\\/api\\/rooms\\/batch/);\nassert.match(adminApi,/room\\.pause/);\nassert.match(adminApi,/room\\.resume/);\nassert.match(workbench,/bulkUserApply/);\nassert.match(workbench,/data-user-check/);\nassert.match(workbench,/batchPause/);\nassert.match(workbench,/batchResume/);\nconsole.log("feature-policy.test: PASS (fresh home, bulk users, room pause workbench)");\n`);
}
console.log('v0.1.2 latest-main conflict resolution applied');
