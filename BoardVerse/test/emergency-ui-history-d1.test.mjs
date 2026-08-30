import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/index-v020.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v021\.js"/);
assert.match(source, /from "\.\/index-v019\.js"/);
assert.match(source, /pollEmergencyGlobalLite/);
assert.match(source, /SELECT seq,id,sender_name,message_text,created_at FROM emergency_global_chat WHERE seq>\?/);
assert.match(source, /document\.visibilityState==='hidden'/);
assert.match(source, /rect\.bottom<0\|\|rect\.top>innerHeight\*1\.25/);
assert.match(source, /await sleep\(10000\)/);
assert.match(source, /45000/);

assert.match(source, /boardverse-do-quota-notice/);
assert.match(source, /boardverse-emergency-d1-banner/);
assert.match(source, /stripOldNotices/);
assert.match(source, /id="bvEmergencyNotice"/);
assert.match(source, /今天不再顯示/);
assert.match(source, /boardverseEmergencyNoticeDismissed/);
assert.match(source, /BoardVerse 服務模式說明/);
assert.match(source, /我知道了/);

assert.match(source, /const oldBoot = "if\(ready&&session&&session\.roomId&&session\.token&&\(!code\|\|session\.roomId===code\)\)\{connectRoom\(\)\}"/);
assert.match(source, /const newBoot = "if\(ready&&code&&session&&session\.roomId&&session\.token&&session\.roomId===code\)\{connectRoom\(\)\}"/);
assert.match(source, /root-does-not-resume-room/);

const start = source.indexOf('const NOTICE_SCRIPT = `<script');
assert.ok(start >= 0, "custom emergency notice script missing");
const bodyStart = source.indexOf('>', start) + 1;
const bodyEnd = source.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > start && bodyEnd > bodyStart, "custom emergency notice script boundary invalid");
new vm.Script(source.slice(bodyStart, bodyEnd), { filename: "emergency-notice.js" });

console.log("emergency-ui-history-d1.test: PASS");
