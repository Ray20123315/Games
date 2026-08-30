import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { applyRoomSettings, roomSettingsSnapshot } from "../src/room/settings-workspace-v2.js";

const entry = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const server = await readFile(new URL("../src/room/settings-workspace.js", import.meta.url), "utf8");
const serverV2 = await readFile(new URL("../src/room/settings-workspace-v2.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/ui/room-workspace-ui.js", import.meta.url), "utf8");
const clockPresets = await readFile(new URL("../src/ui/room-clock-presets.js", import.meta.url), "utf8");
const accountPresets = await readFile(new URL("../src/ui/room-account-presets.js", import.meta.url), "utf8");
const ruleSelects = await readFile(new URL("../src/ui/room-rule-selects.js", import.meta.url), "utf8");
const voiceSettings = await readFile(new URL("../src/ui/room-voice-settings.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v022\.js"/);
for (const marker of [
  'SETTINGS_RE','/feature/room-settings','emergencyRoomSettings','injectRoomWorkspace','injectClockPresetAddon','injectAccountPresetAddon','injectRuleSelectAddon','injectVoiceSettingsAddon','GameRoomV021','await applyRoomSettings','settings-workspace-v2.js',
]) assert.ok(entry.includes(marker), `entry missing ${marker}`);
for (const marker of [
  'roomSettingsSnapshot','applyRoomSettings','owner_required','game_immutable','settings_locked_during_match','account_name_managed','name_taken',
  'playerChatSlowMs','spectatorChatSlowMs','focusGuardAllowedLeaves','normalizeClockConfig','requireRevision','resetReady','disableQueue','focusGuardMatchId',
  'PBKDF2','passwordSalt','passwordHash','ownerNameEditable','clearReturnPassword','sanitizeRules',
]) assert.ok(server.includes(marker), `server settings missing ${marker}`);
for (const marker of ['voiceEnabled','voiceAvailable','voice_unavailable_emergency','voice_requires_two_players','targetQiguoCount','applyQiguoCapacity','player_count_too_small']) assert.ok(serverV2.includes(marker), `server v2 missing ${marker}`);
for (const marker of [
  'bvRoomSettingsWorkspace','房間設定','回棋盤','儲存設定','房間 Preset','棋鐘模式','玩家聊天室 Slow Mode','觀眾聊天室 Slow Mode',
  '你的名稱','回場密碼（可不填）','bvRsOwnerName','bvRsReturnPassword','bvRsClearPassword','猜先／分色方式',
  '自訂房號（會員）','房號建立後永久不可修改','replayOverlay','100dvh','bvReplayPlayerBar','grid-template-columns:repeat(3','overflow:visible',
]) assert.ok(ui.includes(marker), `workspace UI missing ${marker}`);
for (const marker of ['棋鐘 Preset','Fischer 5+3','Fischer 10+5','Bronstein 10+5','30 秒 × 5','bvRsClockPreset']) assert.ok(clockPresets.includes(marker), `clock preset addon missing ${marker}`);
for (const marker of ['/api/presets','config_json','Preset 已保存到會員帳號','需登入會員才能使用 Preset','gameId:currentGameId()','feature:{clockConfig:clock','voiceEnabled','focusGuardAllowedLeaves']) assert.ok(accountPresets.includes(marker), `account preset addon missing ${marker}`);
for (const marker of ['sideMode','猜單雙','隨機抽籤','玩家協議','drawMode','playerCount','King of the Hill']) assert.ok(ruleSelects.includes(marker), `rule select addon missing ${marker}`);
for (const marker of ['bvRsVoice','1v1 P2P 對手語音','voiceAvailable','緊急 D1／七國模式不提供 P2P 語音']) assert.ok(voiceSettings.includes(marker), `voice settings addon missing ${marker}`);
assert.match(ui, /body\.bv-room-settings-open #room \.room-layout\{display:none!important\}/);
assert.match(ui, /#replayOverlay \.replay-dialog\{width:100%!important;max-width:none!important;height:100%!important/);
assert.match(ui, /@media\(max-width:959px\)/);
assert.doesNotMatch(ui, /\.bv-replay-player-options\{[^}]*overflow-x:auto/s, "mobile replay controls must not require horizontal scrolling");
assert.match(ui, /returnPassword=byId\('bvRsReturnPassword'\)\.value/);
assert.match(ui, /revision:Number\(current&&current\.revision\|\|0\)/);

for (const [source, marker, filename] of [
  [ui, 'export const ROOM_WORKSPACE_SCRIPT = String.raw`<script', 'room-workspace-ui.js'],
  [clockPresets, 'export const ROOM_CLOCK_PRESET_SCRIPT = String.raw`<script', 'room-clock-presets.js'],
  [accountPresets, 'export const ROOM_ACCOUNT_PRESET_SCRIPT = String.raw`<script', 'room-account-presets.js'],
  [ruleSelects, 'export const ROOM_RULE_SELECT_SCRIPT = String.raw`<script', 'room-rule-selects.js'],
  [voiceSettings, 'export const ROOM_VOICE_SETTINGS_SCRIPT = String.raw`<script', 'room-voice-settings.js'],
]) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${filename} inline script missing`);
  const bodyStart = source.indexOf('>', start) + 1;
  const bodyEnd = source.indexOf('</script>`;', bodyStart);
  assert.ok(bodyStart > start && bodyEnd > bodyStart, `${filename} script boundary invalid`);
  new vm.Script(source.slice(bodyStart, bodyEnd), { filename });
}

function fixture({ account = false, playing = false } = {}) {
  const owner = { id: "owner", token: "owner-token", name: "Host", nameKey: "host", role: "player", side: "B", userId: account ? "user-1" : null, passwordSalt: null, passwordHash: null };
  const other = { id: "other", token: "other-token", name: "Other", nameKey: "other", role: "player", side: "W" };
  return {
    id: "ABC234", name: "Room", gameId: "gomoku", privateRoom: false, status: playing ? "playing" : "waiting",
    ownerId: owner.id, members: [owner, other], seats: [owner.id, other.id], queue: [], settings: { queueEnabled: true, rotationPolicy: "winner_stays" },
    rules: { variant: "freestyle", boardSize: 15, opening: "none", sideMode: "guess" },
    bv: { revision: 4, gameInstanceId: "g1", ready: { owner: true, other: true }, events: [], deadlines: {}, memberUsers: account ? { owner: "user-1" } : {}, clockConfig: { mode: "untimed" }, voiceEnabled: false, focusGuardEnabled: true, focusGuardAllowedLeaves: 0, focusGuardViolations: {}, focusGuardLastEvent: {}, focusGuardMatchId: null },
  };
}

{
  const room = fixture();
  const before = roomSettingsSnapshot(room, "owner-token");
  assert.equal(before.ownerNameEditable, true);
  assert.equal(before.voiceAvailable, true);
  const saved = await applyRoomSettings(room, "owner-token", {
    revision: before.revision, ownerName: "New Host", returnPassword: "secret-123", roomName: "New Room", privateRoom: true,
    queueEnabled: false, rotationPolicy: "rotate_both", rules: { variant: "exact5", boardSize: 19, opening: "swap", sideMode: "manual" },
    clockConfig: { mode: "fischer", mainMs: 300000, incrementMs: 3000 }, playerChatSlowSeconds: 2, spectatorChatSlowSeconds: 5,
    focusGuardEnabled: true, focusGuardAllowedLeaves: 1, voiceEnabled: true,
  });
  assert.equal(room.id, "ABC234", "room code must stay immutable");
  assert.equal(room.members[0].name, "New Host");
  assert.equal(room.rules.variant, "exact5");
  assert.equal(room.rules.boardSize, 19);
  assert.equal(room.bv.clockConfig.mode, "fischer");
  assert.equal(room.bv.voiceEnabled, true);
  assert.equal(room.settings.queueEnabled, false);
  assert.ok(room.members[0].passwordSalt && room.members[0].passwordHash, "return password must be hashed");
  assert.notEqual(room.members[0].passwordHash, "secret-123");
  assert.equal(saved.revision, 5);
  assert.deepEqual(room.bv.ready, { owner: false, other: false });
}

{
  const room = fixture();
  await assert.rejects(() => applyRoomSettings(room, "owner-token", { revision: 4, ownerName: "Other" }), /名稱已經有人使用/);
  await assert.rejects(() => applyRoomSettings(room, "owner-token", { revision: 3, roomName: "stale" }), /狀態已更新/);
}

{
  const room = fixture({ account: true });
  const snap = roomSettingsSnapshot(room, "owner-token");
  assert.equal(snap.ownerNameEditable, false);
  await assert.rejects(() => applyRoomSettings(room, "owner-token", { revision: snap.revision, ownerName: "Fake Name" }), /帳號名稱管理/);
}

{
  const room = fixture({ playing: true });
  await assert.rejects(() => applyRoomSettings(room, "owner-token", { revision: 4, rules: { variant: "exact5" } }), /對局進行中不可變更/);
  await assert.rejects(() => applyRoomSettings(room, "owner-token", { revision: 4, voiceEnabled: true }), /對局進行中不可變更/);
  const saved = await applyRoomSettings(room, "owner-token", { revision: 4, roomName: "Live Room", playerChatSlowSeconds: 3, spectatorChatSlowSeconds: 4, returnPassword: "live-pass" });
  assert.equal(saved.roomName, "Live Room");
  assert.equal(room.bv.playerChatSlowMs, 3000);
  assert.ok(room.members[0].passwordHash);
}

{
  const room = fixture();
  room.gameId = "qiguo";
  room.rules = { playerCount: 7, drawMode: "country" };
  room.seats = ["owner", "other", null, null, null, null, null];
  room.bv.ready = { owner: true, other: true };
  const saved = await applyRoomSettings(room, "owner-token", { revision: 4, rules: { playerCount: 3, drawMode: "number" }, voiceEnabled: false });
  assert.equal(room.seats.length, 3);
  assert.equal(room.rules.playerCount, 3);
  assert.equal(saved.voiceAvailable, false);
}

console.log("room-settings-workspace.test: PASS");
