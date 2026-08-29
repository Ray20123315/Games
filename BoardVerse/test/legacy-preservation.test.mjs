import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url=new URL('../src/legacy/runtime-v023.js',import.meta.url);let src;
try{src=await readFile(url)}catch(e){if(process.env.ALLOW_MISSING_LEGACY==='1'){console.log('legacy-preservation.test: SKIP local blob (candidate CI must verify)');process.exit(0)}throw e}
const hash=createHash('sha256').update(src).digest('hex');assert.equal(hash,'8f168113e24472377fec462bf61812e0b765a3707f72f7f6b249a6997e4a23e5');const text=src.toString('utf8');
for(const marker of ['host_stays','openGameRuleDetails(gameId)','top-theme-setting','var goGroup=document.createElement(\'optgroup\')','window.__boardverseRuleDrafts','last-move','lastMove'])assert.ok(text.includes(marker),marker);
assert.match(text,/APP_VERSION\s*=\s*["']0\.0\.23["']/);
console.log('legacy-preservation.test: PASS');
