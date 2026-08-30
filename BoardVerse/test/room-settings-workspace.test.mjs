import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const entry = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const server = await readFile(new URL("../src/room/settings-workspace.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/ui/room-workspace-ui.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v022\.js"/);
for (const marker of [
  'SETTINGS_RE','/feature/room-settings','emergencyRoomSettings','injectRoomWorkspace','GameRoomV021',
]) assert.ok(entry.includes(marker), `entry missing ${marker}`);
for (const marker of [
  'roomSettingsSnapshot','applyRoomSettings','owner_required','game_immutable','settings_locked_during_match',
  'playerChatSlowMs','spectatorChatSlowMs','focusGuardAllowedLeaves','normalizeClockConfig','resetReady',
]) assert.ok(server.includes(marker), `server settings missing ${marker}`);
for (const marker of [
  'bvRoomSettingsWorkspace','房間設定','回棋盤','儲存設定','房間 Preset','棋鐘模式','玩家聊天室 Slow Mode','觀眾聊天室 Slow Mode',
  '自訂房號（會員）','房號建立後永久不可修改','replayOverlay','100dvh','bvReplayPlayerBar','overflow:hidden',
]) assert.ok(ui.includes(marker), `workspace UI missing ${marker}`);
assert.match(ui, /body\.bv-room-settings-open #room \.room-layout\{display:none!important\}/);
assert.match(ui, /#replayOverlay \.replay-dialog\{width:100%!important;max-width:none!important;height:100%!important/);
assert.match(ui, /@media\(max-width:959px\)/);

const start = ui.indexOf('export const ROOM_WORKSPACE_SCRIPT = String.raw`<script');
assert.ok(start >= 0, "room workspace inline script missing");
const bodyStart = ui.indexOf('>', start) + 1;
const bodyEnd = ui.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > start && bodyEnd > bodyStart, "room workspace script boundary invalid");
new vm.Script(ui.slice(bodyStart, bodyEnd), { filename: "room-workspace-ui.js" });

console.log("room-settings-workspace.test: PASS");
