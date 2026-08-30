const STYLE = String.raw`<style id="boardverse-admin-data-source-style">
#bvAdminDataSourceWrap{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 8px;border:1px solid var(--line2,#4a402b);border-radius:10px;background:#11110e;color:var(--muted,#a9a18f);font:800 11px system-ui}
#bvAdminDataSource{height:28px;min-width:88px;border:1px solid var(--line2,#4a402b);border-radius:8px;background:#090908;color:var(--text,#f5f1e8);font:900 11px system-ui;padding:0 8px}
#bvAdminSourceBadge{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 9px;border:1px solid #315b6b;border-radius:999px;background:#0b1c24;color:#8eefff;font:900 10px system-ui}
#bvAdminSourceBadge:before{content:"";width:7px;height:7px;border-radius:50%;background:#43e8dc;box-shadow:0 0 10px #43e8dc88}
body.bv-admin-source-do #bvAdminSourceBadge{border-color:#665a32;background:#1b180e;color:#f4da82}body.bv-admin-source-do #bvAdminSourceBadge:before{background:#d4af37;box-shadow:0 0 10px #d4af3788}
#bvAdminSourceNotice{display:none;margin:0 18px 10px;padding:9px 12px;border:1px solid #27586d;border-radius:11px;background:#0b1a23;color:#aeefff;font-size:11px;font-weight:800}
body.bv-admin-source-d1 #bvAdminSourceNotice{display:block}
body.bv-admin-source-d1 #toolbar [id^="batch"],body.bv-admin-source-d1 #bvRoomAnnouncementControls input,body.bv-admin-source-d1 #bvRoomAnnouncementControls button{opacity:.42!important;pointer-events:none!important}
@media(max-width:720px){#bvAdminDataSourceWrap{width:100%;justify-content:space-between}#bvAdminDataSource{flex:1;max-width:180px}#bvAdminSourceNotice{margin:0 10px 10px}}
</style>`;

const SCRIPT = String.raw`<script id="boardverse-admin-data-source-script">(function(){'use strict';
if(window.__BOARDVERSE_ADMIN_SOURCE__)return;window.__BOARDVERSE_ADMIN_SOURCE__=true;
var KEY='boardverseAdminDataSource',nativeFetch=window.fetch.bind(window),source=null,boot=document.querySelector('meta[name="boardverse-admin-data-source"]'),available={d1:boot?boot.dataset.d1==='1':true,do:boot?boot.dataset.do==='1':true},defaultSource=boot&&boot.content==='d1'?'d1':'do';var pageSource=(function(){try{var v=new URL(location.href).searchParams.get('source');return v==='d1'||v==='do'?v:null}catch(_){return null}})();source=pageSource||saved();if(!source||!available[source])source=available[defaultSource]?defaultSource:(available.do?'do':'d1');if(!pageSource&&source!==defaultSource){try{var u=new URL(location.href);u.searchParams.set('source',source);location.replace(u.href);return}catch(_){}}
function tr(h,s,e){var i=window.BoardVerseI18n;return i&&i.t?i.t(h,s,e):h}
function saved(){try{var v=localStorage.getItem(KEY);return v==='d1'||v==='do'?v:null}catch(_){return null}}
function store(v){try{localStorage.setItem(KEY,v)}catch(_){}}
function withSource(input){try{var raw=typeof input==='string'?input:input&&input.url,u=new URL(raw,location.href);if(!u.pathname.startsWith('/admin/api/')||u.pathname==='/admin/api/data-source')return input;u.searchParams.set('source',source||defaultSource);if(typeof input==='string')return u.pathname+u.search+u.hash;return new Request(u,input)}catch(_){return input}}
window.fetch=function(input,init){return nativeFetch(withSource(input),init)};
function applyBody(){document.body.classList.toggle('bv-admin-source-d1',source==='d1');document.body.classList.toggle('bv-admin-source-do',source==='do');document.body.dataset.bvAdminSource=source||''}
function enforceReadonly(){if(source!=='d1')return;['batchPause','batchResume','batchTerminate','batchClose'].forEach(function(id){var b=document.getElementById(id);if(b){b.disabled=true;b.title=tr('D1 房間檢視為唯讀，請切換到 DO。','D1 房间视图为只读，请切换到 DO。','D1 room view is read-only. Switch to DO.')}});var box=document.getElementById('bvRoomAnnouncementControls');if(box)box.querySelectorAll('input,button').forEach(function(n){n.disabled=true})}
function mount(){var top=document.querySelector('.admin-frame .top-actions')||document.querySelector('.admin-frame .topbar');if(!top||document.getElementById('bvAdminDataSourceWrap')){applyBody();enforceReadonly();return}var wrap=document.createElement('label');wrap.id='bvAdminDataSourceWrap';var label=document.createElement('span');label.textContent=tr('資料來源','数据来源','Data source');var sel=document.createElement('select');sel.id='bvAdminDataSource';[['do','DO'],['d1','D1']].forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent=x[1];o.disabled=!available[x[0]];sel.appendChild(o)});sel.value=source;sel.onchange=function(){var v=sel.value;if(v===source)return;source=v;store(v);var u=new URL(location.href);u.searchParams.set('source',v);location.assign(u.href)};var badge=document.createElement('span');badge.id='bvAdminSourceBadge';badge.textContent=source.toUpperCase();wrap.append(label,sel,badge);top.prepend(wrap);var frame=document.getElementById('adminFrame');if(frame&&!document.getElementById('bvAdminSourceNotice')){var n=document.createElement('div');n.id='bvAdminSourceNotice';n.textContent=tr('目前使用 D1 檢視緊急房間資料；房間暫停、終止、關閉與公告屬於 DO 操作，因此此來源下保持唯讀。','当前使用 D1 查看紧急房间数据；房间暂停、终止、关闭与公告属于 DO 操作，因此此来源下保持只读。','D1 is showing emergency room data. Pause, terminate, close, and announcement controls are DO operations and remain read-only in this source.');frame.insertBefore(n,frame.querySelector('.workspace')||null)}applyBody();enforceReadonly()}
store(source);nativeFetch('/admin/api/data-source',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){var x=d&&d.data||{};available=x.available||available;defaultSource=x.defaultSource==='d1'?'d1':'do';if(!available[source]){source=available[defaultSource]?defaultSource:(available.do?'do':'d1');store(source);location.reload();return}mount()}).catch(mount);
new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();</script>`;

export function injectAdminDataSourceUi(source, config = {}) {
  let body=String(source||"");
  const available=config.available||{};
  const boot=`<meta name="boardverse-admin-data-source" content="${config.defaultSource==="d1"?"d1":"do"}" data-d1="${available.d1?"1":"0"}" data-do="${available.do?"1":"0"}">`;
  if(!body.includes('id="boardverse-admin-data-source-style"')) body=body.replace(/<\/head>/i,`${STYLE}</head>`);
  if(!body.includes('id="boardverse-admin-data-source-script"')) body=body.replace(/<head>/i,`<head>${boot}${SCRIPT}`);
  return body;
}
