import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const url=new URL('../src/legacy/runtime-v029.js',import.meta.url);let src;
try{src=await readFile(url)}catch(e){if(process.env.ALLOW_MISSING_LEGACY==='1'){console.log('legacy-preservation.test: SKIP local blob (candidate CI must verify)');process.exit(0)}throw e}
const hash=createHash('sha256').update(src).digest('hex');assert.equal(hash,'650d3f3e2931dc6ac214f0bbb3cea093ef6693b66e18ec020650e98ad35f043a');const text=src.toString('utf8');
for(const marker of ['host_stays','openGameRuleDetails(gameId)','top-theme-setting','var goGroup=document.createElement(\'optgroup\')','window.__boardverseRuleDrafts','last-move','lastMove','xiangqi_random','banqi','qiguo','qiguo_choose','gameCapacity'])assert.ok(text.includes(marker),marker);
assert.match(text,/APP_VERSION\s*=\s*["']0\.0\.29["']/);
console.log('legacy-preservation.test: PASS');
