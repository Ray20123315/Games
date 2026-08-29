import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const sh = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
function one(s, from, to, label) {
  const i = s.indexOf(from);
  if (i < 0) throw new Error(`missing ${label}`);
  if (s.indexOf(from, i + from.length) >= 0) throw new Error(`non-unique ${label}`);
  return s.slice(0, i) + to + s.slice(i + from.length);
}
function regexOne(s, re, to, label) {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const hits = [...s.matchAll(new RegExp(re.source, flags))];
  if (hits.length !== 1) throw new Error(`${label} hits=${hits.length}`);
  return s.replace(re, to);
}

const conflicts = [
  'BoardVerse/src/admin/api.js',
  'BoardVerse/src/admin/pages.js',
  'BoardVerse/src/index-v011.js',
  'BoardVerse/src/ui/feature-policy.js',
  'BoardVerse/test/feature-policy.test.mjs',
  'BoardVerse/test/i18n.test.mjs',
];
for (const p of conflicts) sh('checkout', p.includes('feature-policy.js') || p.includes('test/feature-policy') || p.includes('test/i18n') ? '--theirs' : '--ours', '--', p);

// Keep the v0.1.2 16:9 workbench, but merge latest-main username/bulk-account admin APIs.
{
  const p = 'BoardVerse/src/admin/api.js';
  let s = read(p);
  const helpers = `const MAX_BULK_USERS = 20;\nconst nameKey = (v) => String(v || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");\n\nasync function resolveUserByName(db, value) {\n  const raw = String(value || "").normalize("NFKC").trim();\n  if (!raw) throw new HttpError(400, "username_required", "請輸入使用者名稱。");\n  const key = nameKey(raw);\n  const user = await first(db, "SELECT id,username_display FROM users WHERE username_normalized=? OR id=? LIMIT 1", key, raw);\n  if (!user) throw new HttpError(404, "user_not_found", \`找不到使用者「\${raw}」。\`);\n  return user;\n}\n\nasync function resolveChatSubject(db, env, body) {\n  const subjectType = body.subjectType === "user" ? "user" : "guest";\n  const directId = String(body.subjectId || "").trim();\n  const visibleName = String(body.subjectName || body.name || "").normalize("NFKC").trim();\n  if (directId) return { subjectType, subjectId: directId, subjectName: visibleName || directId };\n  if (!visibleName) throw new HttpError(400, "subject_name_required", "請指定使用者／訪客名稱。");\n  if (subjectType === "user") { const user = await resolveUserByName(db, visibleName); return { subjectType, subjectId: user.id, subjectName: user.username_display }; }\n  if (!env.GLOBAL_CHAT) throw new HttpError(503, "global_chat_unavailable", "GLOBAL_CHAT 尚未綁定。");\n  const response = await env.GLOBAL_CHAT.getByName("global").fetch("https://boardverse.internal/admin/state");\n  const state = await response.json().catch(() => ({ messages: [] }));\n  const key = nameKey(visibleName);\n  const matches = (Array.isArray(state.messages) ? state.messages : []).filter((m) => m?.senderKind === "guest" && nameKey(m?.name) === key);\n  const ids = [...new Set(matches.map((m) => String(m.senderId || "")).filter(Boolean))];\n  if (!ids.length) throw new HttpError(404, "guest_not_found", \`找不到近期訪客「\${visibleName}」。\`);\n  if (ids.length > 1) throw new HttpError(409, "guest_name_ambiguous", "有多個同名訪客，請直接從聊天室訊息列點選管理。");\n  return { subjectType, subjectId: ids[0], subjectName: visibleName };\n}\n\nfunction cleanBulkNames(body) {\n  const source = Array.isArray(body.usernames) ? body.usernames : [body.username || body.user || body.userId];\n  const out = [], seen = new Set();\n  for (const value of source) { const raw = String(value || "").normalize("NFKC").trim(), key = nameKey(raw); if (!raw || seen.has(key)) continue; seen.add(key); out.push(raw); }\n  if (!out.length) throw new HttpError(400, "users_required", "請至少選擇一位使用者。");\n  if (out.length > MAX_BULK_USERS) throw new HttpError(400, "too_many_users", \`單次最多可操作 \${MAX_BULK_USERS} 位使用者。\`);\n  return out;\n}\nfunction disciplineValue(body, action) {\n  if (action === "suspend") { const days = Math.max(1, Math.min(3650, Math.trunc(Number(body.days ?? body.value) || 1))); return Date.now() + days * 86_400_000; }\n  return body.value;\n}\n`;
  s = one(s, 'const LIMIT = 50;\n', 'const LIMIT = 50;\n' + helpers, 'admin helper insertion');
  const bulk = `  if (path === "/admin/api/users/bulk-discipline" && request.method === "POST") {\n    const b=await request.json(), usernames=cleanBulkNames(b), action=String(b.action||""), reason=cleanReason(b.reason), results=[];\n    for (const requestedName of usernames) {\n      try {\n        const user=await resolveUserByName(db,requestedName);\n        if(action==="confirmed_cheating"){const days=Math.max(1,Math.min(3650,Math.trunc(Number(b.days??b.value)||7)));await confirmCheatingDefault(db,user.id,{reason,suspendedUntil:Date.now()+days*86_400_000,adminActor:actor});}\n        else await applyDiscipline(db,user.id,action,{reason,value:disciplineValue(b,action),adminActor:actor});\n        results.push({username:user.username_display,ok:true});\n      } catch(error) { results.push({username:requestedName,ok:false,message:String(error?.message||error)}); }\n    }\n    const succeeded=results.filter((r)=>r.ok).length; return {total:results.length,succeeded,failed:results.length-succeeded,results};\n  }\n`;
  s = one(s, '  if (path === "/admin/api/user/discipline" && request.method === "POST") {\n', bulk + '  if (path === "/admin/api/user/discipline" && request.method === "POST") {\n', 'bulk user endpoint');
  s = one(s,
    '    const b=await request.json(); return applyDiscipline(db,String(b.userId||""),String(b.action||""),{reason:cleanReason(b.reason),value:b.value,adminActor:actor});',
    '    const b=await request.json(), user=await resolveUserByName(db,b.username||b.user||b.userId); return applyDiscipline(db,user.id,String(b.action||""),{reason:cleanReason(b.reason),value:disciplineValue(b,String(b.action||"")),adminActor:actor});',
    'single user discipline');
  s = one(s,
    '    const b=await request.json(); return confirmCheatingDefault(db,String(b.userId||""),{reason:cleanReason(b.reason),suspendedUntil:Number(b.suspendedUntil),adminActor:actor});',
    '    const b=await request.json(), user=await resolveUserByName(db,b.username||b.user||b.userId); return confirmCheatingDefault(db,user.id,{reason:cleanReason(b.reason),suspendedUntil:Number(b.suspendedUntil),adminActor:actor});',
    'confirmed cheating name resolution');
  s = regexOne(s,
    /  if \(path === "\/admin\/api\/global-chat\/mute" && request\.method === "POST"\) \{[^\n]+\n/,
    '  if (path === "/admin/api/global-chat/mute" && request.method === "POST") { const b=await request.json(),subject=await resolveChatSubject(db,env,b),until=Number(b.mutedUntil),reason=cleanReason(b.reason); if(!Number.isFinite(until)||until<=Date.now())throw new HttpError(400,"mute_invalid","Mute 參數不合法。"); await run(db,`INSERT INTO chat_mutes(subject_type,subject_id,channel,muted_until,reason,created_at) VALUES(?,?,\'global\',?,?,?) ON CONFLICT(subject_type,subject_id,channel) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason`,subject.subjectType,subject.subjectId,until,reason,Date.now()); await audit(db,"global_chat.mute",{adminActor:actor,targetType:subject.subjectType,targetId:subject.subjectId,reason,after:{mutedUntil:until,subjectName:subject.subjectName}}); return {ok:true}; }\n',
    'global chat name resolution');
  write(p, s);
}

// Preserve latest main's server-rendered level hook while keeping v0.1.2 pause and signed-in nav.
{
  const p = 'BoardVerse/src/index-v011.js'; let s = read(p);
  s = one(s, 'import { FEATURE_POLICY_SCRIPT } from "./ui/feature-policy.js";\n', 'import { FEATURE_POLICY_SCRIPT } from "./ui/feature-policy.js";\nimport { injectAdminLevelPanel } from "./admin/level-ui.js";\n', 'level ui import');
  s = one(s,
    '    const navAccount = requestUrl.pathname === "/" ? await publicNavAccount(effectiveEnv, request) : null;\n    const localized = injectSiteScripts(injectPublicNav(await response.text(), requestUrl.pathname, navAccount));',
    '    const source = await response.text();\n    const withAdminLevel = injectAdminLevelPanel(source, requestUrl.pathname);\n    const navAccount = requestUrl.pathname === "/" ? await publicNavAccount(effectiveEnv, request) : null;\n    const localized = injectSiteScripts(injectPublicNav(withAdminLevel, requestUrl.pathname, navAccount));',
    'combined html enhancement flow');
  write(p, s);
}

// Latest main removed the client-side level card; keep that, but never reintroduce the body-wide observer that locks fresh sessions.
{
  const p = 'BoardVerse/src/ui/feature-policy.js'; let s = read(p);
  s = one(s, 'if(hint)hint.textContent=voiceHintText();', 'if(hint&&hint.textContent!==voiceHintText())hint.textContent=voiceHintText();', 'idempotent voice hint');
  s = one(s,
    "function boot(){checkAuth();syncCreateVoice();var o=new MutationObserver(syncCreateVoice);o.observe(document.body,{childList:true,subtree:true});document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}",
    "function boot(){checkAuth();syncCreateVoice();setTimeout(syncCreateVoice,0);document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}\nwindow.addEventListener('boardverse:create-extras-mounted',function(){syncCreateVoice()});",
    'remove body mutation observer');
  write(p, s);
}

// Extend the 16:9 workbench with latest-main bulk account/name-based controls.
{
  const p = 'BoardVerse/src/admin/workbench.js'; let s = read(p);
  s = one(s,
    "var current='rooms', roomRows=[], roomSelected=new Set(), confirmAction=null, toastTimer=null;",
    "var current='rooms', roomRows=[], roomSelected=new Set(), userRows=[], userSelected=new Set(), confirmAction=null, toastTimer=null;",
    'workbench user selection state');
  const replacement = String.raw`function userHtml(rows){userRows=rows||[];var body=userRows.map(function(r){var name=String(r.username_display||r.id||''),selected=userSelected.has(name);return '<tr class="'+(selected?'selected':'')+'"><td><button class="room-check" aria-label="選擇 '+esc(name)+'" aria-checked="'+(selected?'true':'false')+'" data-user-check="'+esc(name)+'"></button></td><td><strong>'+esc(name)+'</strong></td><td>'+esc(r.email_normalized||'—')+'</td><td>'+esc(r.status||'—')+'</td><td>Lv.'+esc(r.level||1)+'</td><td>'+esc(r.gp||0)+'</td><td>'+esc(r.reputation||0)+'</td><td><button class="btn" data-user-manage="'+esc(name)+'">管理</button></td></tr>'}).join('');return '<div class="table-wrap"><table><thead><tr><th>選擇</th><th>帳號</th><th>Email</th><th>狀態</th><th>等級</th><th>GP</th><th>信譽</th><th>操作</th></tr></thead><tbody>'+body+'</tbody></table></div>'}
function syncUserButtons(){var n=userSelected.size,c=$('userSelectedCount');if(c)c.textContent=n+' 已選';var b=$('bulkManageBtn');if(b)b.disabled=n===0}
function bindUserRows(){document.querySelectorAll('[data-user-check]').forEach(function(b){b.onclick=function(){var n=b.dataset.userCheck;if(userSelected.has(n))userSelected.delete(n);else userSelected.add(n);out.innerHTML=userHtml(userRows);bindUserRows();syncUserButtons()}});document.querySelectorAll('[data-user-manage]').forEach(function(b){b.onclick=function(){if($('disciplineUser'))$('disciplineUser').value=b.dataset.userManage;if($('cheatUser'))$('cheatUser').value=b.dataset.userManage;notify('已選擇 '+b.dataset.userManage)}})}
function toggleAllUsers(){var names=userRows.map(function(r){return String(r.username_display||r.id||'')}).filter(Boolean),all=names.length&&names.every(function(n){return userSelected.has(n)});names.forEach(function(n){if(all)userSelected.delete(n);else userSelected.add(n)});out.innerHTML=userHtml(userRows);bindUserRows();syncUserButtons()}
function bulkUsers(){var names=Array.from(userSelected),action=$('bulkUserAction').value,reason=String($('bulkUserReason').value||'').trim(),value=String($('bulkUserValue').value||'').trim();if(!names.length)return notify('請先選擇帳號',true);if(!reason){$('bulkUserReason').focus();return notify('批量處分必須填寫原因',true)}var body={usernames:names,action:action,reason:reason};if(value!=='')body[action==='suspend'||action==='confirmed_cheating'?'days':'value']=Number.isNaN(Number(value))?value:Number(value);post('/admin/api/users/bulk-discipline',body).then(function(d){setResult('帳號批量操作：成功 '+d.succeeded+' / '+d.total,d.failed>0);userSelected.clear();loadUsers($('userQuery')&&$('userQuery').value||'');loadSummary()}).catch(function(e){notify(e.message,true)})}
function userToolbar(){toolbar.innerHTML='<div class="filter-wrap">'+input('userQuery','搜尋帳號 / Email')+'</div><span class="selection-count" id="userSelectedCount">0 已選</span>'+btn('selectAllUsers','全選可見','')+btn('bulkManageBtn','批量管理','danger');$('userQuery').oninput=function(){loadUsers(this.value)};$('selectAllUsers').onclick=toggleAllUsers;$('bulkManageBtn').onclick=bulkUsers;syncUserButtons()}
function toolsUsers(){tools.innerHTML='<div class="tool-card"><h3>批量帳號處分</h3>'+field('Action',select('bulkUserAction',[["warning","warning"],["reputation_set","reputation_set"],["gp_delta","gp_delta"],["gp_zero","gp_zero"],["level_set","level_set"],["suspend","suspend（值＝天數）"],["ban","ban"],["restore","restore"],["revoke_sessions","revoke_sessions"],["custom_room_suspend","custom_room_suspend"],["custom_room_restore","custom_room_restore"],["unlimited_custom_room","unlimited_custom_room"],["mute_global","mute_global"],["mute_room","mute_room"],["mute_all_chat","mute_all_chat"],["confirmed_cheating","confirmed_cheating（值＝停權天數）"]]))+field('值 / 天數',input('bulkUserValue','依 action 可留空'))+field('原因',input('bulkUserReason','必填'))+'<p class="muted">先在左側勾選帳號，再按上方「批量管理」。</p></div><div class="tool-card"><h3>單一帳號處分</h3>'+field('帳號名稱',input('disciplineUser','Username'))+field('Action',select('disciplineAction',[["warning","warning"],["reputation_set","reputation_set"],["gp_delta","gp_delta"],["gp_zero","gp_zero"],["level_set","level_set"],["suspend","suspend"],["ban","ban"],["restore","restore"],["revoke_sessions","revoke_sessions"],["custom_room_suspend","custom_room_suspend"],["custom_room_restore","custom_room_restore"],["unlimited_custom_room","unlimited_custom_room"],["mute_global","mute_global"],["mute_room","mute_room"],["mute_all_chat","mute_all_chat"]]))+field('值 / 天數',input('disciplineValue','依 action 可留空'))+field('原因',input('disciplineReason','必填'))+btn('disciplineSave','執行處分','danger')+'</div><div class="tool-card"><h3>確認作弊預設</h3><p>Reputation 0 / GP 0 / Lv.1 / 停權</p>'+field('帳號名稱',input('cheatUser','Username'))+field('停權截止',input('cheatUntil','timestamp'))+field('原因',input('cheatReason','必填'))+btn('cheatApply','套用預設處分','danger')+'</div><div class="tool-card"><h3>管理員建立帳號</h3>'+field('Username',input('activationUsername','Username'))+field('Email',input('activationEmail','Email','', 'email'))+btn('activationCreate','建立一次性啟用連結','gold')+'</div>';bindUserTools()}
function bindUserTools(){$('disciplineSave').onclick=function(){var value=$('disciplineValue').value.trim();if(value==='true'||value==='false')value=value==='true';else if(value!==''&&!Number.isNaN(Number(value)))value=Number(value);post('/admin/api/user/discipline',{username:$('disciplineUser').value,action:$('disciplineAction').value,value:value,reason:$('disciplineReason').value}).then(function(){notify('帳號處分已執行');loadUsers($('userQuery')&&$('userQuery').value||'');loadSummary()}).catch(function(e){notify(e.message,true)})};$('cheatApply').onclick=function(){post('/admin/api/user/confirmed-cheating',{username:$('cheatUser').value,suspendedUntil:Number($('cheatUntil').value),reason:$('cheatReason').value}).then(function(){notify('作弊預設處分已套用');loadUsers('')}).catch(function(e){notify(e.message,true)})};$('activationCreate').onclick=function(){post('/admin/api/user/activation',{username:$('activationUsername').value,email:$('activationEmail').value}).then(function(d){var url=location.origin+'/activate?token='+d.token;setResult('一次性啟用連結：'+url,false);navigator.clipboard&&navigator.clipboard.writeText(url).catch(function(){});notify('啟用連結已建立並嘗試複製')}).catch(function(e){notify(e.message,true)})}}
function loadUsers(q){out.innerHTML='<div class="loading">載入帳號…</div>';api('/admin/api/users'+(q?'?q='+encodeURIComponent(q):'')).then(function(rows){userRows=rows||[];out.innerHTML=userHtml(userRows);bindUserRows();syncUserButtons()}).catch(function(e){out.innerHTML='<div class="empty">'+esc(e.message)+'</div>'})}
function toolsReplay()`;
  s = regexOne(s, /function toolsUsers\(\)\{[\s\S]*?function toolsReplay\(\)/, replacement, 'replace user workbench');
  // Configure users with a dedicated top toolbar while preserving all other tab behavior.
  s = one(s, "if(key==='rooms'){grid.classList.add('rooms');tools.hidden=true;roomToolbar();loadRooms();return}", "if(key==='rooms'){grid.classList.add('rooms');tools.hidden=true;roomToolbar();loadRooms();return}if(key==='users'){grid.classList.remove('rooms','audit');tools.hidden=false;userToolbar();toolsUsers();loadUsers('');return}", 'users configure path');
  write(p, s);
}

// Merge latest-main tests with the new workbench/pause/fresh-session invariants.
{
  const p = 'BoardVerse/test/feature-policy.test.mjs'; let s = read(p);
  s = one(s, 'const adminApi = await readFile(new URL("../src/admin/api.js", import.meta.url), "utf8");', 'const adminApi = await readFile(new URL("../src/admin/api.js", import.meta.url), "utf8");\nconst workbench = await readFile(new URL("../src/admin/workbench.js", import.meta.url), "utf8");', 'workbench test import');
  s = one(s, 'assert.match(entry, /feature\\.canReady = feature\\.myRole === "player" && feature\\.status === "waiting"/);', 'assert.match(entry, /feature\\.canReady = !feature\\.adminPaused && feature\\.myRole === "player" && feature\\.status === "waiting"/);\nassert.match(entry, /feature\\.canUndo = !feature\\.adminPaused/);\nassert.match(entry, /room_admin_paused/);', 'pause feature assertions');
  s = one(s, 'assert.doesNotMatch(policy, /bvAdminLevelCard/);', 'assert.doesNotMatch(policy, /bvAdminLevelCard/);\nassert.doesNotMatch(policy, /new MutationObserver/);\nassert.match(policy, /boardverse:create-extras-mounted/);\nassert.match(entry, /injectAdminLevelPanel/);', 'fresh session policy assertions');
  // Main page assertions target its superseded monolithic console. Point capability tests at the new workbench instead.
  const start = 'assert.match(admin, /class="summary-strip"/);';
  const end = 'assert.doesNotMatch(admin, />User ID</);';
  const a = s.indexOf(start), b = s.indexOf(end);
  if (a < 0 || b < a) throw new Error('admin assertion range missing');
  const cap = `assert.match(workbench, /class="admin-frame"/);\nassert.match(workbench, /data-user-check/);\nassert.match(workbench, /data-user-manage/);\nassert.match(workbench, /id="bulkManageBtn"/);\nassert.match(workbench, /id="selectAllUsers"/);\nassert.match(workbench, /\\/admin\\/api\\/users\\/bulk-discipline/);\nassert.match(workbench, /batchPause/);\nassert.match(workbench, /batchResume/);\nassert.match(workbench, /batchTerminate/);\nassert.match(workbench, /batchClose/);\nassert.doesNotMatch(workbench, /\\bprompt\\s*\\(/);\nassert.doesNotMatch(workbench, /\\bconfirm\\s*\\(/);\nassert.doesNotMatch(workbench, />User ID</);`;
  s = s.slice(0, a) + cap + s.slice(b + end.length);
  s = one(s, 'console.log("feature-policy.test: PASS (ready, login-only voice, bulk modal admin)");', 'console.log("feature-policy.test: PASS (admin pause, fresh-session safety, bulk user + room workbench)");', 'feature policy test label');
  write(p, s);
}
{
  const p = 'BoardVerse/test/i18n.test.mjs'; let s = read(p);
  if (!s.includes('scripts += SITE_I18N_SCRIPT')) {
    s = one(s, 'assert.match(entry, /injectSiteScripts/);', 'assert.match(entry, /injectSiteScripts/);\nassert.match(entry, /scripts \\+= SITE_I18N_SCRIPT/);', 'i18n site script assertion');
  }
  write(p, s);
}

for (const p of conflicts) sh('add', p);
sh('add', 'BoardVerse/src/admin/workbench.js', 'BoardVerse/src/admin/level-ui.js');
console.log('v0.1.2 latest-main reconciliation applied');
