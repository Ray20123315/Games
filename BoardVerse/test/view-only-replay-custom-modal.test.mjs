import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index-v014.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

for (const marker of [
  'import appV013, { GameRoom as GameRoomBase } from "./index-v013.js"',
  'PUBLIC_REPLAY_DOWNLOAD_RE',
  'PUBLIC_REPLAY_VIEW_RE',
  'replay_download_disabled',
  '此 Replay 只提供線上觀看，不提供下載。',
  'stripPublicReplayDownload',
  'offlineLink',
  'boardverse-unified-modal-style',
  'boardverse-unified-modal-bootstrap',
  'boardverse-unified-modal-patches',
  'window.alert=function',
  'window.prompt=function',
  'window.confirm=function',
  'patchHostKick',
  'patchAdminAnnouncement',
  'patchPresetDelete',
  'patchAdminCleanup',
  'patchShare',
  'boardverse:replay',
  '只供觀看 · 不提供下載',
]) assert.ok(source.includes(marker), `missing v014 marker: ${marker}`);

assert.match(source, /request\.method === "GET" && PUBLIC_REPLAY_DOWNLOAD_RE\.test\(url\.pathname\)/);
assert.match(source, /status: 403/);
assert.match(source, /location\.assign\(String\(d\.url\)\)/);
assert.match(source, /window\.BoardVerseModal\.confirm/);
assert.match(source, /window\.BoardVerseModal\.alert/);
assert.match(source, /window\.BoardVerseModal\.prompt/);
assert.match(source, /"main": "src\/index-v014\.js"/);
assert.match(wrangler, /"main": "src\/index-v014\.js"/);

console.log("view-only-replay-custom-modal.test: PASS");
