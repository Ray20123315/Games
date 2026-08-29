import assert from 'node:assert/strict';
import vm from 'node:vm';
import { BRIDGE_SCRIPT, ENHANCE_SCRIPT, enhanceLegacyHtml } from '../src/ui/enhance.js';
import { replayDocument } from '../src/replay/replay-page.js';
import { accountPage } from '../src/ui/pages.js';
import { adminDashboardPage } from '../src/admin/pages.js';
function inlineScripts(html){return [...String(html).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim())}
for(const [name,html] of [['bridge',BRIDGE_SCRIPT],['enhance',ENHANCE_SCRIPT]]){const scripts=inlineScripts(html);assert.equal(scripts.length,1,name);new vm.Script(scripts[0],{filename:name+'.js'})}
const legacyBadge='<html><body><span class="small muted">v0.0.29</span></body></html>';
const upgradedBadge=enhanceLegacyHtml(legacyBadge);
assert.match(upgradedBadge,/<span class="small muted">v0\.1\.1<\/span>/,'public version badge must use product version');
assert.doesNotMatch(upgradedBadge,/>v0\.0\.29<\/span>/,'legacy runtime version must not leak into public badge');
const replay=replayDocument({id:'r',game_type:'gomoku',variant:null,players:[],result:{reason:'ok'},timeControl:{mode:'untimed'},finished_at:1,events:[]});for(const [i,src] of inlineScripts(replay).entries())new vm.Script(src,{filename:`replay-${i}.js`});
const account=accountPage({username_display:'u',email_normalized:'u@example.com'},{level:1,name:'新進棋友',gp:0,reputation:100,presetSlots:1},[]);for(const [i,src] of inlineScripts(account).entries())new vm.Script(src,{filename:`account-${i}.js`});
const admin=adminDashboardPage();for(const [i,src] of inlineScripts(admin).entries())new vm.Script(src,{filename:`admin-${i}.js`});
console.log('browser-scripts.test: PASS');
