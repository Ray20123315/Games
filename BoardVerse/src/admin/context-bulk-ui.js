export const ADMIN_CONTEXT_BULK_SCRIPT = String.raw`<script id="boardverse-admin-context-bulk">
window.addEventListener('DOMContentLoaded',()=>{
 const out=document.getElementById('out');
 if(!out||!document.getElementById('adminDialog'))return;
 const tr=(h,s,e)=>{let l='zh-Hant';try{l=localStorage.getItem('boardverseLang')||'zh-Hant'}catch{}return l==='en'?e:l==='zh-Hans'?s:h};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
 async function api(path,opt){const r=await fetch(path,opt),d=await r.json().catch(()=>({message:tr('回應格式錯誤','响应格式错误','Invalid response')}));if(!r.ok)throw new Error(d.message||tr('操作失敗','操作失败','Action failed'));return d?.data??d}
 const post=(path,body)=>api(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const dlg=document.getElementById('adminDialog'),form=document.getElementById('adminDialogForm'),title=document.getElementById('adminDialogTitle'),body=document.getElementById('adminDialogBody'),cancel=document.getElementById('adminDialogCancel'),confirm=document.getElementById('adminDialogConfirm'),x=document.getElementById('adminDialogX');
 function modal(opts){return new Promise(resolve=>{let done=false;const finish=v=>{if(done)return;done=true;dlg.close();resolve(v)};title.textContent=opts.title||tr('管理操作','管理操作','Admin action');body.innerHTML=opts.body||'';confirm.textContent=opts.confirmText||tr('確認','确认','Confirm');confirm.className=opts.danger?'danger':'';cancel.textContent=tr('取消','取消','Cancel');cancel.style.display=opts.closeOnly?'none':'';form.onsubmit=e=>{e.preventDefault();finish(Object.fromEntries(new FormData(form).entries()))};cancel.onclick=()=>finish(null);x.onclick=()=>finish(null);dlg.oncancel=e=>{e.preventDefault();finish(null)};dlg.showModal()})}
 async function message(titleText,html,bad=false){await modal({title:titleText,body:'<div class="dialog-message '+(bad?'bad':'')+'">'+html+'</div>',confirmText:tr('關閉','关闭','Close'),closeOnly:true})}
 function resultHtml(d,label){return '<p>'+esc(label)+': '+d.succeeded+' / '+d.total+'</p><ul class="dialog-result-list">'+d.results.map(r=>'<li>'+(r.ok?'✓ ':'✗ ')+esc(r.roomId||r.id||'')+(r.ok?'':' — '+esc(r.message||''))+'</li>').join('')+'</ul>'}
 function refresh(tab){document.querySelector('#adminTabs button[data-tab="'+tab+'"]')?.click();if(typeof window.summary==='function')window.summary().catch(()=>{})}

 async function roomBulk(roomIds){
  if(!roomIds.length)return;
  const v=await modal({title:roomIds.length>1?tr('批量管理房間','批量管理房间','Bulk manage rooms'):tr('管理房間','管理房间','Manage room'),body:'<div class="dialog-grid"><div class="dialog-field wide"><span>'+tr('已選房間','已选房间','Selected rooms')+'</span><div class="dialog-targets">'+roomIds.map(esc).join('<br>')+'</div></div><div class="dialog-field"><span>'+tr('動作','操作','Action')+'</span><select name="action" autofocus><option value="terminate">'+tr('終止目前遊戲','终止当前游戏','Terminate current game')+'</option><option value="close">'+tr('關閉房間','关闭房间','Close room')+'</option></select></div><div class="dialog-field wide"><span>'+tr('原因','原因','Reason')+'</span><textarea name="reason" required></textarea></div></div>',confirmText:tr('套用','应用','Apply'),danger:true});
  if(!v)return;
  try{const d=await post('/admin/api/rooms/bulk-action',{roomIds,action:v.action,reason:v.reason});await message(tr('房間操作結果','房间操作结果','Room action results'),resultHtml(d,tr('成功','成功','Succeeded')),d.failed>0);refresh('rooms')}catch(e){await message(tr('操作失敗','操作失败','Action failed'),esc(e.message),true)}
 }

 async function replayManage(replayIds,labels){
  if(!replayIds.length)return;
  const v=await modal({title:replayIds.length>1?tr('批量管理回放','批量管理回放','Bulk manage replays'):tr('管理回放','管理回放','Manage replay'),body:'<div class="dialog-grid"><div class="dialog-field wide"><span>'+tr('已選回放','已选回放','Selected replays')+'</span><div class="dialog-targets">'+labels.map(esc).join('<br>')+'</div></div><div class="dialog-field"><span>'+tr('動作','操作','Action')+'</span><select name="action" autofocus><option value="unpublish">'+tr('改為不公開','改为不公开','Make private')+'</option><option value="publish">'+tr('恢復公開 7 天','恢复公开 7 天','Republish for 7 days')+'</option><option value="delete">'+tr('永久刪除','永久删除','Delete permanently')+'</option></select></div><div class="dialog-field wide"><span>'+tr('原因','原因','Reason')+'</span><textarea name="reason" required></textarea></div><div class="dialog-field wide"><div class="action-hint">'+tr('永久刪除會移除回放與事件資料，無法復原。','永久删除会移除回放与事件数据，无法恢复。','Permanent deletion removes replay and event data and cannot be undone.')+'</div></div></div>',confirmText:tr('套用','应用','Apply'),danger:true});
  if(!v)return;
  try{const d=await post('/admin/api/replays/bulk-action',{replayIds,action:v.action,reason:v.reason});await message(tr('回放操作結果','回放操作结果','Replay action results'),resultHtml(d,tr('成功','成功','Succeeded')),d.failed>0);refresh('replays')}catch(e){await message(tr('操作失敗','操作失败','Action failed'),esc(e.message),true)}
 }

 function addCheckColumn(table,prefix,idGetter){
  if(table.dataset[prefix+'Checks'])return false;
  table.dataset[prefix+'Checks']='1';
  const hr=table.tHead?.rows?.[0];if(hr){const th=document.createElement('th');th.className='check-col';th.innerHTML='<input type="checkbox" class="ctx-select-all" aria-label="'+tr('全選','全选','Select all')+'">';hr.insertBefore(th,hr.firstChild)}
  [...(table.tBodies?.[0]?.rows||[])].forEach(row=>{const id=idGetter(row);if(!id)return;const td=document.createElement('td');td.className='check-col';td.innerHTML='<input type="checkbox" class="ctx-row-check" value="'+esc(id)+'">';row.insertBefore(td,row.firstChild)});
  const all=table.querySelector('.ctx-select-all');if(all)all.onchange=()=>table.querySelectorAll('.ctx-row-check').forEach(c=>c.checked=all.checked);
  return true;
 }
 function chosen(table){return [...table.querySelectorAll('.ctx-row-check:checked')].map(c=>c.value)}

 function decorateRooms(){
  const table=out.querySelector('#roomTable table');if(!table)return;
  if(!addCheckColumn(table,'room',row=>row.querySelector('[data-room]')?.dataset.room))return;
  const holder=out.querySelector('#roomTable');const bar=document.createElement('div');bar.className='toolbar ctx-bulk-toolbar';bar.innerHTML='<span class="muted ctx-count">'+tr('未選擇房間','未选择房间','No rooms selected')+'</span><button type="button" class="ctx-room-bulk">'+tr('批量管理','批量管理','Bulk manage')+'</button>';holder.insertBefore(bar,table);
  const update=()=>{const n=chosen(table).length;bar.querySelector('.ctx-count').textContent=n?tr('已選 ','已选 ','Selected ')+n:tr('未選擇房間','未选择房间','No rooms selected');bar.querySelector('button').disabled=!n};table.addEventListener('change',update);bar.querySelector('button').onclick=()=>roomBulk(chosen(table));update();
 }
 function decorateReplays(){
  const table=out.querySelector('#replayTable table');if(!table)return;
  if(!addCheckColumn(table,'replay',row=>row.querySelector('[data-replay-view]')?.dataset.replayView))return;
  [...table.tBodies[0].rows].forEach(row=>{const id=row.querySelector('[data-replay-view]')?.dataset.replayView;if(!id)return;const actions=row.querySelector('.row-actions');if(actions&&!actions.querySelector('.ctx-replay-manage')){const b=document.createElement('button');b.type='button';b.className='ctx-replay-manage';b.textContent=tr('管理','管理','Manage');b.onclick=()=>replayManage([id],[row.cells[2]?.textContent?.trim()||id]);actions.appendChild(b)}});
  const holder=out.querySelector('#replayTable');const bar=document.createElement('div');bar.className='toolbar ctx-bulk-toolbar';bar.innerHTML='<span class="muted ctx-count">'+tr('未選擇回放','未选择回放','No replays selected')+'</span><button type="button" class="ctx-replay-bulk">'+tr('批量管理','批量管理','Bulk manage')+'</button>';holder.insertBefore(bar,table);
  const update=()=>{const n=chosen(table).length;bar.querySelector('.ctx-count').textContent=n?tr('已選 ','已选 ','Selected ')+n:tr('未選擇回放','未选择回放','No replays selected');bar.querySelector('button').disabled=!n};table.addEventListener('change',update);bar.querySelector('button').onclick=()=>{const ids=chosen(table),labels=ids.map(id=>{const row=[...table.tBodies[0].rows].find(r=>r.querySelector('.ctx-row-check')?.value===id);return row?.cells[2]?.textContent?.trim()||id});replayManage(ids,labels)};update();
 }
 const decorate=()=>{decorateRooms();decorateReplays()};
 new MutationObserver(()=>queueMicrotask(decorate)).observe(out,{childList:true,subtree:true});
 decorate();
});
</script>`;
