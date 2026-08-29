import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { replayDocument } from "../src/replay/replay-page.js";

const productionEntry = await readFile(new URL("../src/index-v013.js", import.meta.url), "utf8");

for (const marker of [
  "publicIdentityForUser",
  "publicAdminIdentity",
  "getUserMembership",
  "feature/attach-identity",
  "attachRoomIdentity",
  "roomIdentities",
  "boardverse-room-public-identity",
  "bv-room-id-owner",
  "bv-room-id-admin",
  "bv-room-id-member",
  "bv-room-id-guest",
]) assert.ok(productionEntry.includes(marker), `missing room identity marker: ${marker}`);

assert.match(productionEntry, /roomSocketMatch/);
assert.match(productionEntry, /\/ws\\\/\\\(\[A-Z2-9\]\{6\}\\\)/);
assert.match(productionEntry, /sanitizePublicIdentity/);
assert.match(productionEntry, /badge: "OWNER"/);
assert.match(productionEntry, /badge: "ADMIN"/);
assert.match(productionEntry, /badge: `Lv\.\$\{level\}`/);
assert.doesNotMatch(productionEntry, /ADMIN_PASSWORD|ADMIN_USERNAME/);

const board = Array(15 * 15).fill(null);
board[7 * 15 + 7] = "B";
board[7 * 15 + 8] = "W";
const replayHtml = replayDocument({
  id: "replay-test",
  game_type: "gomoku",
  variant: "freestyle",
  players: [{ name: "A", side: "B" }, { name: "B", side: "W" }],
  result: { winner: "B", reason: "形成五連" },
  timeControl: { mode: "untimed" },
  finished_at: Date.now(),
  events: [{
    type: "game_started",
    revision: 1,
    payload: { game: { type: "gomoku", size: 15, board, lastMove: { r: 7, c: 8 } } },
  }],
});

assert.match(replayHtml, /class="board-stage"/);
assert.match(replayHtml, /function makeSvg/);
assert.match(replayHtml, /function renderIntersectionBoard/);
assert.match(replayHtml, /className='board line-board'/);
assert.match(replayHtml, /\(c\+\.5\)\/cols\*100/);
assert.match(replayHtml, /Clock: 無計時/);
assert.doesNotMatch(replayHtml, /className='cell'/);
assert.doesNotMatch(replayHtml, /\.cell\{position:relative;border/);

const scripts = [...replayHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], { filename: "standalone-replay.inline.js" });

console.log("room-identity-replay.test: PASS (public room identities and live-style standalone replay boards)");
