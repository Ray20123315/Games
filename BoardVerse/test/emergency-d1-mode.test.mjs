import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const entry = await readFile(new URL("../src/index-v019.js", import.meta.url), "utf8");
const production = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const backend = await readFile(new URL("../src/emergency/d1-mode.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v022\.js"/);
assert.match(production, /from "\.\/index-v021\.js"/);
assert.match(wrangler, /"d1_databases"\s*:/);
assert.match(wrangler, /"binding"\s*:\s*"BOARDVERSE_D1"/);
assert.doesNotMatch(wrangler, /"database_id"\s*:/, "emergency D1 must use Wrangler automatic provisioning rather than a fake resource id");
assert.match(wrangler, /"BOARDVERSE_EMERGENCY_D1"\s*:\s*"1"/);
assert.match(wrangler, /"BOARDVERSE_EMERGENCY_UNTIL"/);

for (const marker of [
  'from "./index-v018.js"',
  'from "./emergency/d1-mode.js"',
  'BOARDVERSE_D1',
  '/api/emergency/rooms/',
  '/api/emergency/global/poll',
  '/api/emergency/global/message',
  'boardverse-emergency-d1-client',
  'class EmergencyWebSocket extends EventTarget',
  'window.WebSocket=EmergencyWebSocket',
  'boardverse:feature',
  '緊急 D1 模式',
]) assert.ok(entry.includes(marker), `missing emergency entry marker: ${marker}`);

for (const marker of [
  'Object.create(CurrentGameRoom.prototype)',
  'CREATE TABLE IF NOT EXISTS emergency_rooms',
  'CREATE TABLE IF NOT EXISTS emergency_global_chat',
  'WHERE room_id=? AND revision=?',
  'engine.initRoom',
  'engine.enterRoom',
  'engine.webSocketMessage',
  'engine.sendState',
  'pollEmergencyRoom',
  'postEmergencyGlobal',
  'cleanupEmergencyD1',
]) assert.ok(backend.includes(marker), `missing emergency backend marker: ${marker}`);

const start = entry.indexOf('const EMERGENCY_CLIENT_SCRIPT = String.raw`<script');
assert.ok(start >= 0, "emergency client script missing");
const bodyStart = entry.indexOf('>', start) + 1;
const bodyEnd = entry.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > start && bodyEnd > bodyStart, "emergency client script boundary invalid");
new vm.Script(entry.slice(bodyStart, bodyEnd), { filename: "emergency-d1-client.js" });

console.log("emergency-d1-mode.test: PASS");
