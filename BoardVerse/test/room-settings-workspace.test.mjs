import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const entry = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const server = await readFile(new URL("../src/room/settings-workspace.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/ui/room-workspace-ui.js", import.meta.url), "utf8");
const clockPresets = await readFile(new URL("../src/ui/room-clock-presets.js", import.meta.url), "utf8");
const accountPresets = await readFile(new URL("../src/ui/room-account-presets.js", import.meta.url), "utf8");
const ruleSelects = await readFile(new URL("../src/ui/room-rule-selects.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v022\.js"/);
for (const marker of [
  'SETTINGS_RE','/feature/room-settings','emergencyRoomSettings','injectRoomWorkspace','injectClockPresetAddon','injectAccountPresetAddon','injectRuleSelectAddon','GameRoomV021',
]) assert.ok(entry.includes(marker), `entry missing ${marker}`);
for (const marker of [
  'roomSettingsSnapshot','applyRoomSettings','owner_required','game_immutable','settings_locked_during_match',
  'playerChatSlowMs','spectatorChatSlowMs','focusGuardAllowedLeaves','normalizeClockConfig','resetReady','disableQueue','focusGuardMatchId',
]) assert.ok(server.includes(marker), `server settings missing ${marker}`);
for (const marker of [
  'bvRoomSettingsWorkspace','房間設定','回棋盤','儲存設定','房間 Preset','棋鐘模式','玩家聊天室 Slow Mode','觀眾聊天室 Slow Mode',
  '自訂房號（會員）','房號建立後永久不可修改','replayOverlay','100dvh','bvReplayPlayerBar','overflow:hidden',
]) assert.ok(ui.includes(marker), `workspace UI missing ${marker}`);
for (const marker of ['棋鐘 Preset','Fischer 5+3','Fischer 10+5','Bronstein 10+5','30 秒 × 5','bvRsClockPreset']) assert.ok(clockPresets.includes(marker), `clock preset addon missing ${marker}`);
for (const marker of ['/api/presets','config_json','Preset 已保存到會員帳號','需登入會員才能使用 Preset']) assert.ok(accountPresets.includes(marker), `account preset addon missing ${marker}`);
for (const marker of ['sideMode','猜單雙','隨機抽籤','玩家協議','drawMode','King of the Hill']) assert.ok(ruleSelects.includes(marker), `rule select addon missing ${marker}`);
assert.match(ui, /body\.bv-room-settings-open #room \.room-layout\{display:none!important\}/);
assert.match(ui, /#replayOverlay \.replay-dialog\{width:100%!important;max-width:none!important;height:100%!important/);
assert.match(ui, /@media\(max-width:959px\)/);

for (const [source, marker, filename] of [
  [ui, 'export const ROOM_WORKSPACE_SCRIPT = String.raw`<script', 'room-workspace-ui.js'],
  [clockPresets, 'export const ROOM_CLOCK_PRESET_SCRIPT = String.raw`<script', 'room-clock-presets.js'],
  [accountPresets, 'export const ROOM_ACCOUNT_PRESET_SCRIPT = String.raw`<script', 'room-account-presets.js'],
  [ruleSelects, 'export const ROOM_RULE_SELECT_SCRIPT = String.raw`<script', 'room-rule-selects.js'],
]) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${filename} inline script missing`);
  const bodyStart = source.indexOf('>', start) + 1;
  const bodyEnd = source.indexOf('</script>`;', bodyStart);
  assert.ok(bodyStart > start && bodyEnd > bodyStart, `${filename} script boundary invalid`);
  new vm.Script(source.slice(bodyStart, bodyEnd), { filename });
}

console.log("room-settings-workspace.test: PASS");
