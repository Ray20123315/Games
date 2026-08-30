import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const entry = await readFile(new URL("../src/index-v021.js", import.meta.url), "utf8");
const productionEntry = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const room = await readFile(new URL("../src/room/focus-guard-room.js", import.meta.url), "utf8");
const emergency = await readFile(new URL("../src/emergency/d1-focus-mode.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v022\.js"/);
assert.match(productionEntry, /from "\.\/index-v021\.js"/);
assert.match(entry, /export \{ FocusGuardGameRoom as GameRoom \}/);
assert.match(entry, /FOCUS_REPORT_RE/);
assert.match(entry, /keepalive:true/);
assert.match(entry, /visibilitychange/);
assert.match(entry, /window\.addEventListener\('blur'/);
assert.match(entry, /window\.addEventListener\('pagehide'/);
assert.match(entry, /document\.visibilityState==='hidden'\|\|!document\.hasFocus\(\)/);
assert.match(entry, /focus_guard_settings/);
assert.match(entry, /focus_violation/);
assert.match(entry, /bvFocusGuardModal/);
assert.match(entry, /bvFocusGuardAllowedLeaves|focusGuardAllowedLeaves/);
assert.match(entry, /0 = 第一次離開就判負/);
assert.match(entry, /了解並準備/);
assert.match(entry, /pollEmergencyRoomLean/);

for (const marker of [
  'bv.focusGuardEnabled = true',
  'bv.focusGuardAllowedLeaves = clampAllowedLeaves',
  'bv.focusGuardMatchId = null',
  'bv.focusGuardMatchId = bv.gameInstanceId',
  'resetReady(room, false)',
  'count > allowed',
  'focus_guard_violation',
  'super.resign(member.token)',
  'focusGuardActive',
  'canConfigureFocusGuard',
]) assert.ok(room.includes(marker), `missing room focus guard marker: ${marker}`);

assert.match(room, /room\.status === "playing" && bv\.focusGuardMatchId === bv\.gameInstanceId/);
assert.match(room, /if \(bv\.focusGuardLastEvent\[member\.id\] === eventId\) return \{ duplicate: true \}/);
assert.match(room, /對局進行中不能修改防切頁規則/);
assert.match(room, /focusGuardEnabled = feature\.focusGuardEnabled !== false/);

assert.match(emergency, /const POLL_MS = 2000/);
assert.match(emergency, /const POLL_LOOPS = 8/);
assert.match(emergency, /Object\.create\(FocusGuardGameRoom\.prototype\)/);
assert.match(emergency, /focus_guard_settings/);
assert.match(emergency, /focus_violation/);
assert.match(emergency, /WHERE room_id=\? AND revision=\?/);

const start = entry.indexOf('const FOCUS_SCRIPT = String.raw`<script');
assert.ok(start >= 0, "focus guard browser script missing");
const bodyStart = entry.indexOf('>', start) + 1;
const bodyEnd = entry.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > start && bodyEnd > bodyStart, "focus guard browser script boundary invalid");
new vm.Script(entry.slice(bodyStart, bodyEnd), { filename: "focus-guard-client.js" });

console.log("focus-guard-d1-usage.test: PASS");
