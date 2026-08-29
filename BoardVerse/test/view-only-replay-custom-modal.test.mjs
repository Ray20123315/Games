import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index-v015.js", import.meta.url), "utf8");
const previous = await readFile(new URL("../src/index-v014.js", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/legacy/runtime-v029.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

for (const marker of [
  'import appV014, { GameRoom as GameRoomBase } from "./index-v014.js"',
  'boardverse-room-replay-scope',
  '房內使用者皆可查看 · 不提供下載',
  'removeMisinterpretedPublicReplayRoomUi',
  'renderPublicReplay',
  'boardverse:replay',
  'boardverse-admin-zh-style',
  'boardverse-admin-zh',
  "'Operations Workbench':'營運管理台'",
  "'Risk Flags':'風險標記'",
  "'Global Chat':'全局聊天室'",
  "'Audit Log':'稽核紀錄'",
  "warning:'警告'",
  "confirmed_cheating:'確認作弊'",
  'url.pathname.startsWith("/admin")',
  'HEADERS',
  'ACTIONS',
  'VALUES',
]) assert.ok(source.includes(marker), `missing v015 marker: ${marker}`);

assert.match(runtime, /const MAX_REPLAY_HISTORY = 12/);
assert.match(runtime, /member && member\.role !== "pending" \? room\.replays\.slice\(-MAX_REPLAY_HISTORY\)/);
assert.match(runtime, /auth\.member\.role === "pending"/);
assert.match(runtime, /type:'replay_get',replayId:rep\.id/);
assert.match(runtime, /function renderReplays\(r\)/);
assert.doesNotMatch(runtime.match(/function renderReplays\(r\)[\s\S]*?function openReplay/)?.[0] || "", /download/i);

assert.match(previous, /replay_download_disabled/);
assert.match(previous, /boardverse-unified-modal/);
assert.match(previous, /window\.alert=function/);
assert.match(previous, /window\.prompt=function/);
assert.match(previous, /window\.confirm=function/);
assert.match(wrangler, /"main": "src\/index-v015\.js"/);

console.log("view-only-replay-custom-modal.test: PASS (room replay view-only scope and admin zh-TW UI)");
