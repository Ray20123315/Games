import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path, text){ fs.writeFileSync(path,text); }
function replaceOne(text, from, to, label){
  const first=text.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(text.indexOf(from,first+from.length)>=0) throw new Error(`non-unique ${label}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
}
function replaceRegexOne(text, re, to, label){
  const hits=[...text.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
  if(hits.length!==1) throw new Error(`${label} expected 1 hit, got ${hits.length}`);
  return text.replace(re,to);
}

{
  const path='src/ui/enhance.js';
  let s=read(path);
  s=replaceOne(s,
    "B.prototype=NativeWS.prototype;Object.setPrototypeOf(B,NativeWS);for(var k of ['CONNECTING','OPEN','CLOSING','CLOSED'])B[k]=NativeWS[k];window.WebSocket=B;",
    "B.prototype=NativeWS.prototype;Object.setPrototypeOf(B,NativeWS);window.WebSocket=B;",
    'WebSocket readonly constants');
  s=replaceOne(s,
    "var $=function(id){return document.getElementById(id)}, feature=null, clockTimer=null, globalWs=null, peer=null, localStream=null, remoteAudio=null;",
    "var $=function(id){return document.getElementById(id)}, feature=null, clockTimer=null, globalWs=null, peer=null, localStream=null, remoteAudio=null, syncMultiplayerGameOptions=function(){};",
    'enhance state');
  s=replaceOne(s,
    "function lang(){return localStorage.getItem('boardverseLang')||'zh-Hant'}",
    "function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}",
    'safe language storage');
  s=replaceOne(s,
    "if(!tools||$('bvAccount'))return;",
    "if(!tools||$('bvAccount')||$('bvPublicNav'))return;",
    'public nav duplicate guard');
  s=replaceOne(s,
    "'<div class=\"setting-row\"><div class=\"setting-label\">'+text('自訂房號（會員）','自定义房号（会员）','Custom room code (member)')+'</div><input id=\"bvCustomCode\" maxlength=\"6\" placeholder=\"ABC234\"></div>'+",
    "'<div class=\"setting-row\"><div class=\"setting-label\">'+text('自訂房號（會員）','自定义房号（会员）','Custom room code (member)')+'</div><div class=\"bv-code-shell\"><span class=\"bv-code-prefix\">#</span><input id=\"bvCustomCode\" class=\"bv-custom-input\" maxlength=\"6\" autocomplete=\"off\" autocapitalize=\"characters\" spellcheck=\"false\" placeholder=\"ABC234\"><span class=\"bv-code-size\">6</span></div></div>'+",
    'custom room code field');
  s=replaceOne(s,
    "function syncMultiplayerGameOptions(){",
    "syncMultiplayerGameOptions=function(){",
    'multiplayer sync scope');
  s=replaceOne(s,
    "if($('queueEnabledCreate'))$('queueEnabledCreate').disabled=false}}\nfunction collectPreset",
    "if($('queueEnabledCreate'))$('queueEnabledCreate').disabled=false}};\nfunction collectPreset",
    'multiplayer sync terminator');
  s=replaceOne(s,
    "host.addEventListener('input',function(e){if(e.target&&e.target.id!=='bvClockPreset'&&e.target.id&&e.target.id.indexOf('bvClock')===0)$('bvClockPreset').value='custom';sync()});",
    "host.addEventListener('input',function(e){if(e.target&&e.target.id==='bvCustomCode')e.target.value=String(e.target.value||'').toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g,'').slice(0,6);if(e.target&&e.target.id!=='bvClockPreset'&&e.target.id&&e.target.id.indexOf('bvClock')===0)$('bvClockPreset').value='custom';sync()});",
    'custom room code sanitizer');

  const saveReplacement = String.raw`function ensurePresetNameModal(){var overlay=$('bvPresetNameOverlay');if(overlay)return overlay;overlay=el('div',{id:'bvPresetNameOverlay',class:'overlay hidden'});var card=el('section',{class:'dialog-card bv-preset-dialog',role:'dialog','aria-modal':'true','aria-labelledby':'bvPresetNameTitle'});card.innerHTML='<div class="collapse-head"><div><div class="eyebrow">Preset</div><h3 id="bvPresetNameTitle">'+text('儲存房間 Preset','保存房间 Preset','Save room preset')+'</h3></div><button id="bvPresetNameClose" class="collapse-btn" type="button" aria-label="Close">×</button></div><label class="bv-modal-label" for="bvPresetNameInput">'+text('Preset 名稱','Preset 名称','Preset name')+'</label><input id="bvPresetNameInput" class="bv-modal-input" maxlength="40" autocomplete="off" placeholder="'+text('例如：15 路五子棋快棋','例如：15 路五子棋快棋','Example: 15×15 blitz')+'"><div id="bvPresetNameStatus" class="notice" aria-live="polite"></div><div class="dialog-actions"><button id="bvPresetNameCancel" class="btn ghost" type="button">'+text('取消','取消','Cancel')+'</button><button id="bvPresetNameConfirm" class="btn" type="button">'+text('儲存','保存','Save')+'</button></div>';overlay.appendChild(card);document.body.appendChild(overlay);function close(){overlay.classList.add('hidden');$('bvPresetNameConfirm').disabled=false}$('bvPresetNameClose').onclick=close;$('bvPresetNameCancel').onclick=close;overlay.addEventListener('click',function(e){if(e.target===overlay)close()});$('bvPresetNameInput').addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Enter'){e.preventDefault();$('bvPresetNameConfirm').click()}});return overlay}
function openPresetNameModal(){var overlay=ensurePresetNameModal(),input=$('bvPresetNameInput'),status=$('bvPresetNameStatus'),save=$('bvPresetNameConfirm');input.value='';status.textContent='';status.className='notice';save.disabled=false;overlay.classList.remove('hidden');setTimeout(function(){input.focus()},0);save.onclick=function(){var name=String(input.value||'').trim();if(!name){status.textContent=text('請輸入 Preset 名稱。','请输入 Preset 名称。','Enter a preset name.');status.className='notice err';input.focus();return}save.disabled=true;status.textContent=text('儲存中…','保存中…','Saving…');status.className='notice';api('/api/presets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name,config:collectPreset()})}).then(function(){loadPresets();status.textContent=text('Preset 已儲存。','Preset 已保存。','Preset saved.');status.className='notice';setTimeout(function(){overlay.classList.add('hidden')},450)}).catch(function(e){status.textContent=e.message||text('儲存失敗。','保存失败。','Save failed.');status.className='notice err'}).finally(function(){save.disabled=false})}}
$('bvApplyPreset').onclick=applyPreset;$('bvSavePreset').onclick=openPresetNameModal;loadPresets();window.dispatchEvent(new CustomEvent('boardverse:create-extras-mounted'))}`;
  s=replaceRegexOne(s, /\$\('bvApplyPreset'\)\.onclick=applyPreset;\$\('bvSavePreset'\)\.onclick=function\(\)\{var name=prompt\([\s\S]*?\};loadPresets\(\)\}/, saveReplacement, 'native preset prompt');

  const style = String.raw`export const ENHANCE_STYLE = String.raw\`<style id="boardverse-enhance-style">
#bvFeatureCreate .bv-code-shell{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-height:42px;border:1px solid #58492f;border-radius:11px;background:linear-gradient(180deg,#17140f,#100e0b);padding:0 10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 6px 18px rgba(0,0,0,.12)}
#bvFeatureCreate .bv-code-prefix{display:grid;place-items:center;width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,#806a3c,#c3a15f 55%,#e7d7a8);color:#211a0f;font-weight:900}
#bvFeatureCreate #bvCustomCode,.bv-modal-input{-webkit-appearance:none;appearance:none;width:100%;min-width:0;height:40px;border:0!important;outline:0;background:transparent!important;color:var(--text);font:800 14px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.12em;padding:0 2px;box-shadow:none!important}
#bvFeatureCreate #bvCustomCode{text-transform:uppercase}.bv-code-size{display:grid;place-items:center;min-width:25px;height:25px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;font-weight:800}
#bvFeatureCreate .bv-code-shell:focus-within{border-color:#c3a15f;box-shadow:0 0 0 3px rgba(195,161,95,.15),inset 0 1px 0 rgba(255,255,255,.035)}
.bv-preset-dialog{width:min(480px,100%)}.bv-modal-label{display:block;margin:16px 0 7px;color:var(--muted);font-size:12px;font-weight:800}.bv-modal-input{height:46px!important;border:1px solid var(--line)!important;border-radius:11px!important;background:var(--panel3)!important;padding:0 12px!important;letter-spacing:.02em;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Noto Sans TC",sans-serif}.bv-modal-input:focus{border-color:#c3a15f!important;box-shadow:0 0 0 3px rgba(195,161,95,.15)!important}.bv-preset-dialog .notice{margin-top:8px}
body.page-theme-white #bvFeatureCreate .bv-code-shell{background:#fffdf8;border-color:#b9a98e}body.page-theme-white #bvFeatureCreate #bvCustomCode{color:#292319}body.page-theme-white .bv-modal-input{background:#fffdf8!important;color:#292319!important}
</style>\`;

`;
  s=replaceOne(s,
    "</script>`;\n\nexport const ENHANCE_SCRIPT = String.raw`<script>",
    "</script>`;\n\n"+style+"export const ENHANCE_SCRIPT = String.raw`<script>",
    'enhance style insertion');
  s=replaceOne(s,
    "  return html.replace(\"</body>\", `${ENHANCE_SCRIPT}</body>`);",
    "  if (!html.includes('id=\"boardverse-enhance-style\"')) html = html.replace(\"</head>\", `${ENHANCE_STYLE}</head>`);\n  return html.replace(\"</body>\", `${ENHANCE_SCRIPT}</body>`);",
    'enhance style injection');
  write(path,s);
}

{
  const path='src/ui/feature-policy.js';
  let s=read(path);
  s=replaceOne(s,
    "if(hint)hint.textContent=voiceHintText();",
    "if(hint&&hint.textContent!==voiceHintText())hint.textContent=voiceHintText();",
    'voice hint idempotence');
  s=replaceOne(s,
    "function boot(){mountAdminLevel();checkAuth();syncCreateVoice();var o=new MutationObserver(function(){syncCreateVoice();mountAdminLevel()});o.observe(document.body,{childList:true,subtree:true});document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}",
    "function boot(){mountAdminLevel();checkAuth();syncCreateVoice();setTimeout(function(){syncCreateVoice();mountAdminLevel()},0);document.addEventListener('change',function(e){if(e.target&&e.target.id==='gameId')setTimeout(syncCreateVoice,0)},true)}\nwindow.addEventListener('boardverse:create-extras-mounted',function(){syncCreateVoice()});",
    'body-wide mutation observer');
  write(path,s);
}

{
  const path='src/index-v011.js';
  let s=read(path);
  s=replaceOne(s,
    'import { sessionUser } from "./auth/sessions.js";',
    'import { sessionUser } from "./auth/sessions.js";\nimport { getUserMembership } from "./membership/membership.js";',
    'membership import');
  s=replaceRegexOne(s, /function injectPublicNav\(source, pathname\) \{[\s\S]*?\n\}\n\nfunction injectSiteScripts/, String.raw`function escapeNavText(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
async function publicNavAccount(env, request) {
  if (!env?.BOARDVERSE_DB) return null;
  try {
    const user = await sessionUser(env.BOARDVERSE_DB, request);
    if (!user) return null;
    const membership = await getUserMembership(env.BOARDVERSE_DB, user.id);
    return { label: `${user.username_display || user.username || "Account"} · Lv.${Number(membership?.level || 1)}` };
  } catch { return null; }
}
function injectPublicNav(source, pathname, account) {
  if (pathname !== "/" || source.includes('id="bvPublicNav"')) return source;
  const auth = account
    ? `<a id="bvPublicAccount" href="/account" style="color:#fff;text-decoration:none;padding:6px 8px;font-weight:800">${escapeNavText(account.label)}</a>`
    : `<a href="/login" style="color:#fff;text-decoration:none;padding:6px 8px">登入</a><a href="/register" style="color:#fff;text-decoration:none;padding:6px 8px">註冊</a>`;
  const nav = `<nav id="bvPublicNav" aria-label="BoardVerse" style="position:fixed;z-index:9999;top:12px;right:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 10px;border:1px solid rgba(127,127,127,.35);border-radius:12px;background:rgba(18,20,26,.92);backdrop-filter:blur(10px);box-shadow:0 8px 28px rgba(0,0,0,.25);font:600 14px/1.2 system-ui,sans-serif"><span style="opacity:.72;margin-right:2px">v${APP_VERSION}</span>${auth}<a href="/report" style="color:#fff;text-decoration:none;padding:6px 8px">回報</a><a href="/admin" style="color:#fff;text-decoration:none;padding:6px 8px">管理</a></nav>`;
  return source.replace(/<body([^>]*)>/i, (match) => `${match}${nav}`);
}

function injectSiteScripts`, 'public navigation function');
  s=replaceOne(s,
    '    const localized = injectSiteScripts(injectPublicNav(await response.text(), requestUrl.pathname));',
    '    const navAccount = requestUrl.pathname === "/" ? await publicNavAccount(effectiveEnv, request) : null;\n    const localized = injectSiteScripts(injectPublicNav(await response.text(), requestUrl.pathname, navAccount));',
    'public navigation identity');
  write(path,s);
}

{
  const path='test/public-surface.test.mjs';
  let s=read(path);
  s=replaceOne(s,
    "for (const href of ['/login', '/register', '/report', '/admin']) {",
    "for (const href of ['/login', '/register', '/account', '/report', '/admin']) {",
    'public nav route assertions');
  s=replaceOne(s,
    "assert.match(entry, /APP_VERSION/);",
    "assert.match(entry, /APP_VERSION/);\nassert.match(entry, /publicNavAccount/);\nassert.match(entry, /getUserMembership/);\nassert.match(entry, /bvPublicAccount/);\nassert.match(entry, /username_display/);",
    'public nav account assertions');
  write(path,s);
}

{
  const path='test/feature-policy.test.mjs';
  let s=read(path);
  s=replaceOne(s,
    "assert.match(policy, /action:'level_set'/);",
    "assert.match(policy, /action:'level_set'/);\nassert.doesNotMatch(policy, /new MutationObserver/);\nassert.match(policy, /boardverse:create-extras-mounted/);",
    'feature policy observer regression');
  write(path,s);
}

{
  const path='test/browser-scripts.test.mjs';
  let s=read(path);
  const anchor='console.log("browser script parse test passed");';
  if(!s.includes(anchor)) throw new Error('missing browser script assertion anchor');
  const extra=String.raw`const enhanceSource = await readFile(new URL("../src/ui/enhance.js", import.meta.url), "utf8");
assert.doesNotMatch(enhanceSource, /B\[k\]=NativeWS\[k\]/, "WebSocket wrapper must not overwrite readonly static constants");
assert.match(enhanceSource, /syncMultiplayerGameOptions=function\(\)\{\}/, "multiplayer sync callback must be defined in enhancement scope");
assert.doesNotMatch(enhanceSource, /prompt\(text\('Preset/, "Preset naming must not use native prompt");
assert.match(enhanceSource, /bvPresetNameOverlay/, "Preset naming must use the custom modal");
assert.match(enhanceSource, /bv-code-shell/, "custom room code must use the custom field shell");
`;
  s=s.replace(anchor,extra+anchor);
  write(path,s);
}

console.log('v0.1.2 follow-up patch applied');
