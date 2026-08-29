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
    if(hint)hint.textContent=voiceHintText();
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
function checkAuth(){fetch('/api/voice-entitlement',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json()}).then(function(d){loggedIn=!!d.allowed;authKnown=true;syncCreateVoice()}).catch(function(){loggedIn=false;authKnown=true;syncCreateVoice()})}
function boot(){checkAuth();syncCreateVoice();var o=new MutationObserver(syncCreateVoice);o.observe(document.body,{childList:true,subtree:true});document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}
window.addEventListener('boardverse:feature',function(e){renderRoomVoice(e.detail)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;
