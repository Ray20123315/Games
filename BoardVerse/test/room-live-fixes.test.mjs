import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { injectRoomLiveFixes } from "../src/ui/room-live-fixes.js";

const source = await readFile(new URL("../src/ui/room-live-fixes.js", import.meta.url), "utf8");

for (const marker of [
  "#bvFeatureControls.bv-room-action-strip",
  "flex-wrap:wrap!important",
  "overflow:visible!important",
  "white-space:normal!important",
  "syncSettingsGameSelector",
  "feature.status==='playing'",
  "對局進行中不可切換棋類；本局結束後可直接在原房切換。",
  "切換棋類會保留房號、成員、聊天與歷史回放",
]) assert.ok(source.includes(marker), `room live fix missing ${marker}`);

assert.doesNotMatch(source, /#bvFeatureControls\.bv-room-action-strip\{[^}]*overflow-x:auto/i, "room action strip must not reintroduce horizontal scrolling");
assert.doesNotMatch(source, /#bvFeatureControls\.bv-room-action-strip\{[^}]*flex-wrap:nowrap/i, "room action strip must wrap instead of forcing one line");

const scriptStart = source.indexOf('export const ROOM_LIVE_FIXES_SCRIPT = String.raw`<script');
assert.ok(scriptStart >= 0, "room live fixes inline script missing");
const bodyStart = source.indexOf('>', scriptStart) + 1;
const bodyEnd = source.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > scriptStart && bodyEnd > bodyStart, "room live fixes script boundary invalid");
new vm.Script(source.slice(bodyStart, bodyEnd), { filename: "room-live-fixes.js" });

const html = "<!doctype html><html><head></head><body><main>BoardVerse</main></body></html>";
const once = injectRoomLiveFixes(html);
assert.match(once, /boardverse-room-live-fixes-style/);
assert.match(once, /boardverse-room-live-fixes/);
assert.equal(injectRoomLiveFixes(once), once, "room live fixes injection must be idempotent");

console.log("room-live-fixes.test: PASS");
