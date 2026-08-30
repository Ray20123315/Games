export const AUTHENTICATED_ROOM_FIELDS_SCRIPT = String.raw`<style id="boardverse-authenticated-room-fields-style">
.bv-authenticated-room-password-field{display:none!important}
</style><script id="boardverse-authenticated-room-fields">(function(){
'use strict';if(window.__BOARDVERSE_AUTHENTICATED_ROOM_FIELDS__)return;window.__BOARDVERSE_AUTHENTICATED_ROOM_FIELDS__=true;
var accountState=null,loading=null,pending=false;
function byId(id){return document.getElementById(id)}
function authenticated(data){var identity=data&&data.identity,role=String(identity&&identity.role||'guest'),name=String(identity&&identity.name||(data&&data.user&&data.user.username)||'').normalize('NFKC').trim().slice(0,40);return role!=='guest'&&name?{name:name}:null}
function syncPassword(id,on){var input=byId(id);if(!input)return;var field=input.closest('.field')||input.parentElement;if(on){input.value='';input.disabled=true;input.dataset.bvAuthenticatedHidden='1';if(field)field.classList.add('bv-authenticated-room-password-field')}else if(input.dataset.bvAuthenticatedHidden==='1'){input.disabled=false;delete input.dataset.bvAuthenticatedHidden;if(field)field.classList.remove('bv-authenticated-room-password-field')}}
function syncName(id,name,on){var input=byId(id);if(!input)return;if(on){input.value=name;input.readOnly=true;input.dataset.bvAuthenticatedName='1'}else if(input.dataset.bvAuthenticatedName==='1'){input.readOnly=false;delete input.dataset.bvAuthenticatedName}}
function apply(){pending=false;if(!accountState)return;var auth=authenticated(accountState),on=!!auth;syncPassword('createPassword',on);syncPassword('gatePassword',on);syncName('createName',auth&&auth.name,on);syncName('gateName',auth&&auth.name,on)}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(apply)}
function load(){if(loading)return loading;loading=fetch('/api/me',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}}).then(function(r){return r.ok?r.json():null}).then(function(d){accountState=d;apply();return d}).catch(function(){return null});return loading}
function boot(){load();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;

export function injectAuthenticatedRoomFields(source) {
  const body = String(source || '');
  if (body.includes('id="boardverse-authenticated-room-fields"')) return body;
  return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${AUTHENTICATED_ROOM_FIELDS_SCRIPT}</body>`) : body + AUTHENTICATED_ROOM_FIELDS_SCRIPT;
}
