import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const entry=await readFile(new URL("../src/index-v022.js",import.meta.url),"utf8");
const server=await readFile(new URL("../src/room/settings-room.js",import.meta.url),"utf8");
const safe=await readFile(new URL("../src/room/settings-room-safe.js",import.meta.url),"utf8");
const schema=await readFile(new URL("../src/room/settings-schema.js",import.meta.url),"utf8");
const ui=await readFile(new URL("../src/ui/room-settings.js",import.meta.url),"utf8");
const replay=await readFile(new URL("../src/ui/room-replay-layout.js",import.meta.url),"utf8");
const emergency=await readFile(new URL("../src/emergency/d1-focus-mode.js",import.meta.url),"utf8");
const wrangler=await readFile(new URL("../wrangler.jsonc",import.meta.url),"utf8");

assert.match(wrangler,/"main"\s*:\s*"src\/index-v022\.js"/);
assert.match(entry,/RoomSettingsGameRoom as GameRoom/);
assert.match(entry,/injectRoomSettingsUi/);
assert.match(entry,/injectRoomReplayLayout/);
assert.match(entry,/full-page-v1/);
assert.match(entry,/fixed-large-responsive-v1/);

for(const marker of [
  'ruleset','scoring','komi','koRule','suicide','handicap','sideMode','playerCount','drawMode',
  'winner_stays','rotate_both','host_stays','japanese_byoyomi','bronstein_delay','fischer',
])assert.ok(schema.includes(marker),`settings schema missing ${marker}`);
assert.match(schema,/gameId==="qiguo"\?false:!!input\.queueEnabled/);
assert.match(schema,/focusGuardAllowedLeaves/);

for(const marker of [
  'room_settings_update','只有房主可以修改房間設定','pendingRoomSettings','returnPasswordMode',
  '回場密碼最多 128 個字元','登入會員的房內名稱跟隨帳號','room_settings_queued','room_settings_updated',
  'resizeSeats','resetReady(room,false)','hasReturnPassword','ownerNameLocked',
])assert.ok(server.includes(marker),`settings server missing ${marker}`);
assert.doesNotMatch(server,/customRoomCode\s*=/);
assert.match(safe,/pending&&!allReady/);
assert.match(safe,/bv\.pendingRoomSettings=null/);

for(const marker of [
  'bvRoomSettingsPage','bv-room-settings-page-open','返回房間','儲存設定','你的名稱','回場密碼',
  '房間名稱','棋類（下一局生效）','私人房','輪替方式','規則設定','房間 Preset','棋鐘 Preset',
  '主時間（秒）','Fischer 加秒','Bronstein 延遲','Byo-yomi 每次讀秒','玩家聊天室 Slow Mode',
  '觀眾聊天室 Slow Mode','啟用防切頁模式','房號（不可修改）',
])assert.ok(ui.includes(marker),`settings page missing ${marker}`);
assert.match(ui,/body\.bv-room-settings-page-open>\.app-frame\{display:none/);
assert.doesNotMatch(ui,/side-stack/);
assert.doesNotMatch(ui,/bvCustomCode/);
assert.doesNotMatch(ui,/class=\\?"overlay/);
assert.match(ui,/#bvRoomSlow\{display:none!important\}/);

for(const marker of ['100dvw','100dvh','max-width:100%','overflow:hidden','bvReplayExpand','boardverse:room-replay-frame','orientationchange'])assert.ok(replay.includes(marker),`replay layout missing ${marker}`);
assert.match(replay,/@media\(max-width:959px\)/);
assert.match(replay,/board\.style\.setProperty\('width','100%','important'\)/);
assert.match(replay,/dialog\.classList\.add\('bv-replay-expanded'\)/);

assert.match(emergency,/RoomSettingsGameRoom/);
assert.match(emergency,/room_settings_update/);
assert.match(emergency,/Object\.create\(RoomSettingsGameRoom\.prototype\)/);

function embedded(source,name){const start=source.indexOf(`const ${name}=String.raw\`<script`);assert.ok(start>=0,`missing ${name}`);const bodyStart=source.indexOf('>',start)+1,bodyEnd=source.indexOf('</script>',bodyStart);assert.ok(bodyStart>start&&bodyEnd>bodyStart,`invalid ${name} boundary`);return source.slice(bodyStart,bodyEnd);}
new vm.Script(embedded(ui,"ROOM_SETTINGS_SCRIPT"),{filename:"room-settings-page.js"});
new vm.Script(embedded(replay,"ROOM_REPLAY_LAYOUT_SCRIPT"),{filename:"room-replay-layout.js"});

console.log("room-settings-large-replay.test: PASS");
