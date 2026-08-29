import fs from 'node:fs';
const p='src/admin/workbench.js';
let s=fs.readFileSync(p,'utf8');
const bad="function loadUsers(q){out.innerHTML='<div class=\"loading\">載入帳號…</div>';api('/admin/api/users'+(q?'?q='+encodeURIComponent(q):'')).then(function(rows){out.innerHTML=userHtml(rows);bindUserRows()}).catch(function(e){out.innerHTML='<div class=\"empty\">'+esc(e.message)+'</div>')}";
const good="function loadUsers(q){out.innerHTML='<div class=\"loading\">載入帳號…</div>';api('/admin/api/users'+(q?'?q='+encodeURIComponent(q):'')).then(function(rows){out.innerHTML=userHtml(rows);bindUserRows()}).catch(function(e){out.innerHTML='<div class=\"empty\">'+esc(e.message)+'</div>'})}";
if(!s.includes(bad))throw new Error('loadUsers merge typo marker missing');
s=s.replace(bad,good);
fs.writeFileSync(p,s);
console.log('v0.1.2 merge syntax fix applied');
