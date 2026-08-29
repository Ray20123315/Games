export function injectAdminLevelPanel(source, pathname) {
  const html = String(source || "");
  if (pathname !== "/admin/" || html.includes('id="bvAdminLevelCard"')) return html;

  const marker = '<div class="card"><h3>回報／Risk 審查</h3>';
  if (!html.includes(marker)) return html;

  const panel = `<div class="card" id="bvAdminLevelCard">
    <h3 data-bv-h="帳號等級" data-bv-s="账号等级" data-bv-e="Account level">帳號等級</h3>
    <p class="muted" data-bv-h="直接設定會員等級；操作會保留原因、前後狀態與 Audit Log。" data-bv-s="直接设置会员等级；操作会保留原因、前后状态与 Audit Log。" data-bv-e="Set a membership level directly; reason, before/after state, and Audit Log are retained.">直接設定會員等級；操作會保留原因、前後狀態與 Audit Log。</p>
    <label><span data-bv-h="User ID" data-bv-s="User ID" data-bv-e="User ID">User ID</span><input id="bvLevelUser" autocomplete="off"></label>
    <label><span data-bv-h="等級" data-bv-s="等级" data-bv-e="Level">等級</span><select id="bvLevelValue"><option value="1">Lv.1</option><option value="2">Lv.2</option><option value="3">Lv.3</option><option value="4">Lv.4</option><option value="5">Lv.5</option></select></label>
    <label><span data-bv-h="調整原因" data-bv-s="调整原因" data-bv-e="Reason">調整原因</span><input id="bvLevelReason" autocomplete="off"></label>
    <p><button id="bvLevelSave" type="button" data-bv-h="設定等級" data-bv-s="设置等级" data-bv-e="Set level">設定等級</button></p>
    <p id="bvLevelStatus" class="muted" aria-live="polite"></p>
  </div>`;

  const script = `<script id="bvAdminLevelHandler">
  (function(){
    'use strict';
    var byId=function(id){return document.getElementById(id)};
    var t=function(h,s,e){return window.BoardVerseI18n&&window.BoardVerseI18n.t?window.BoardVerseI18n.t(h,s,e):h};
    var button=byId('bvLevelSave');
    if(!button||button.dataset.bvBound)return;
    button.dataset.bvBound='1';
    button.addEventListener('click',async function(){
      var userId=String(byId('bvLevelUser')&&byId('bvLevelUser').value||'').trim();
      var reason=String(byId('bvLevelReason')&&byId('bvLevelReason').value||'').trim();
      var level=Number(byId('bvLevelValue')&&byId('bvLevelValue').value||1);
      var status=byId('bvLevelStatus');
      if(!userId||!reason){if(status)status.textContent=t('請填 User ID 與調整原因。','请填写 User ID 与调整原因。','Enter a User ID and reason.');return}
      button.disabled=true;
      try{
        var response=await fetch('/admin/api/user/discipline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:userId,action:'level_set',value:level,reason:reason})});
        var data=await response.json().catch(function(){return{}});
        if(!response.ok)throw new Error(data.message||'Request failed');
        if(status)status.textContent=t('等級已更新為 Lv.','等级已更新为 Lv.','Level updated to Lv.')+level;
      }catch(error){
        if(status)status.textContent=error&&error.message?error.message:t('更新失敗。','更新失败。','Update failed.');
      }finally{button.disabled=false}
    });
  })();
  </script>`;

  let next = html.replace(marker, panel + marker);
  return next.includes("</body>") ? next.replace("</body>", script + "</body>") : next + script;
}
