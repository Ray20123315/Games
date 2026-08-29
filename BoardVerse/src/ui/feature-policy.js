export const FEATURE_POLICY_SCRIPT = String.raw`<script id="boardverse-feature-policy">
(function(){
'use strict';
var authKnown=false, loggedIn=false;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function byId(id){return document.getElementById(id)}
function voiceHintText(){return text('語音功能需先登入帳號。','语音功能需先登录账号。','Sign in to use voice.')}
function syncCreateVoice(){
  var box=byId('bvVoice');if(!box||!authKnown)return;
  var hint=byId('bvVoiceLoginHint');
  if(!loggedIn){
    if(box.checked){box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}))}
    box.disabled=true;box.dataset.bvLoginDisabled='1';box.title=voiceHintText();
    if(!hint){hint=document.createElement('span');hint.id='bvVoiceLoginHint';hint.className='small muted';hint.style.marginLeft='8px';box.parentElement&&box.parentElement.appendChild(hint)}
    if(hint&&hint.textContent!==voiceHintText())hint.textContent=voiceHintText();
  }else{
    if(box.dataset.bvLoginDisabled==='1'){delete box.dataset.bvLoginDisabled;if((byId('gameId')||{}).value!=='qiguo')box.disabled=false}
    box.removeAttribute('title');if(hint)hint.remove();
  }
}
function renderRoomVoice(feature){setTimeout(function(){
  if(!feature||!feature.voiceEnabled)return;
  var join=byId('bvVoiceJoin'),status=byId('bvVoiceStatus');
  if(feature.voiceLoginRequired||!feature.myUserId){if(join)join.classList.add('hidden');if(status){status.classList.remove('hidden');status.textContent=voiceHintText()}}
},0)}
function mountAdminLevel(){
  if(location.pathname!=='/admin/'||byId('bvAdminLevelCard'))return;
  var user=byId('disciplineUser');if(!user)return;var card=user.closest('.card');if(!card)return;
  var wrap=document.createElement('div');wrap.id='bvAdminLevelCard';wrap.innerHTML='<hr><h4>'+text('帳號等級','账号等级','Account level')+'</h4><input id="bvLevelUser" placeholder="User ID"><select id="bvLevelValue"><option value="1">Lv.1</option><option value="2">Lv.2</option><option value="3">Lv.3</option><option value="4">Lv.4</option><option value="5">Lv.5</option></select><input id="bvLevelReason" placeholder="'+text('調整原因','调整原因','Reason')+'"><button id="bvLevelSave" type="button">'+text('設定等級','设置等级','Set level')+'</button><p id="bvLevelStatus" class="muted"></p>';card.appendChild(wrap);
  byId('bvLevelSave').onclick=async function(){var id=byId('bvLevelUser').value.trim(),reason=byId('bvLevelReason').value.trim(),level=Number(byId('bvLevelValue').value),out=byId('bvLevelStatus');if(!id||!reason){out.textContent=text('請填 User ID 與調整原因。','请填写 User ID 与调整原因。','Enter a User ID and reason.');return}try{var r=await fetch('/admin/api/user/discipline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:id,action:'level_set',value:level,reason:reason})}),d=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(d.message||'Request failed');out.textContent=text('等級已更新為 Lv.','等级已更新为 Lv.','Level updated to Lv.')+level}catch(e){out.textContent=e.message||text('更新失敗。','更新失败。','Update failed.')}};
}
function checkAuth(){fetch('/api/voice-entitlement',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){loggedIn=!!d.allowed;authKnown=true;syncCreateVoice()}).catch(function(){loggedIn=false;authKnown=true;syncCreateVoice()})}
function boot(){mountAdminLevel();checkAuth();syncCreateVoice();setTimeout(function(){syncCreateVoice();mountAdminLevel()},0);document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}
window.addEventListener('boardverse:create-extras-mounted',function(){syncCreateVoice()});
window.addEventListener('boardverse:feature',function(e){renderRoomVoice(e.detail)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;
