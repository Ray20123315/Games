import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/index-v016.js", import.meta.url), "utf8");
const v015 = await readFile(new URL("../src/index-v015.js", import.meta.url), "utf8");
const v014 = await readFile(new URL("../src/index-v014.js", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/legacy/runtime-v029.js", import.meta.url), "utf8");
const room = await readFile(new URL("../src/room/GameRoom.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

for (const marker of [
  'import appV015, { GameRoom as GameRoomBase } from "./index-v015.js"',
  'replayInterruptions',
  'player_disconnected',
  'player_reconnected',
  'interruptions',
  'boardverse-room-replay-player-style',
  'boardverse-room-replay-player',
  'bvReplayPlay',
  'bvReplaySpeed',
  'bvReplayThinking',
  'bvReplaySkipDisconnect',
  'bvReplayZoom',
  'bvReplayExpand',
  'boardverse:room-replay-frame',
  'boardverse-admin-readable-replay',
  '房號','棋類','對局者','勝者','結果','公開至','保存狀態','查看',
]) assert.ok(source.includes(marker), `missing v016 marker: ${marker}`);

assert.match(source, /async sendReplay\(ws, token, replayId\)/);
assert.match(source, /payload\?\.type === "replay_data"/);
assert.match(source, /payload = \{ \.\.\.payload, replay: \{ \.\.\.payload\.replay, interruptions \} \}/);
assert.match(source, /delta-overlapMs\(from,to,data\.interruptions\)/);
assert.match(source, /parts\.sort/);
assert.match(source, /Math\.round\(base\/speed\(\)\)/);
assert.match(source, /dialog\.appendChild\(bar\)/);
assert.match(source, /bar\.appendChild\(controls\)/);
assert.match(source, /location\.href='\/admin\/replay\/'/);
assert.match(source, /players\.map/);
assert.match(source, /result&&result\.winnerName/);

function embeddedScript(name) {
  const start = source.indexOf(`const ${name} = String.raw\`<script`);
  assert.ok(start >= 0, `missing embedded script ${name}`);
  const bodyStart = source.indexOf(">", start) + 1;
  const bodyEnd = source.indexOf("</script>`;", bodyStart);
  assert.ok(bodyStart > start && bodyEnd > bodyStart, `invalid embedded script boundary ${name}`);
  return source.slice(bodyStart, bodyEnd);
}
new vm.Script(embeddedScript("REPLAY_PLAYER_SCRIPT"), { filename: "room-replay-player.js" });
new vm.Script(embeddedScript("ADMIN_REPLAY_SCRIPT"), { filename: "admin-readable-replay.js" });

assert.match(runtime, /const MAX_REPLAY_HISTORY = 12/);
assert.match(runtime, /member && member\.role !== "pending" \? room\.replays\.slice\(-MAX_REPLAY_HISTORY\)/);
assert.match(runtime, /auth\.member\.role === "pending"/);
assert.match(runtime, /type:'replay_get',replayId:rep\.id/);
assert.match(runtime, /at: Date\.now\(\)/);
assert.doesNotMatch(runtime.match(/function renderReplays\(r\)[\s\S]*?function openReplay/)?.[0] || "", /download/i);
assert.match(room, /appendEvent\(this\.room, "player_disconnected"/);
assert.match(room, /appendEvent\(room, "player_reconnected"/);

assert.match(v015, /boardverse-room-replay-scope/);
assert.match(v015, /房內使用者皆可查看/);
assert.match(v015, /boardverse-admin-zh/);
assert.match(v014, /replay_download_disabled/);
assert.match(v014, /boardverse-unified-modal/);
assert.match(v014, /window\.alert=function/);
assert.match(v014, /window\.prompt=function/);
assert.match(v014, /window\.confirm=function/);
assert.match(wrangler, /"main": "src\/index-v016\.js"/);

console.log("view-only-replay-custom-modal.test: PASS (readable admin replays + enhanced room replay player)");
