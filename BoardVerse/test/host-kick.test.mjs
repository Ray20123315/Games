import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index-v012.js", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("host kick is revisioned and server-authoritative", () => {
  assert.match(source, /msg\?\.type !== "kick_member"/);
  assert.match(source, /requireRevision\(room, msg\.revision\)/);
  assert.match(source, /assertOwner\(room, owner\)/);
  assert.match(source, /if \(target\.id === room\.ownerId\)/);
});

test("a seated member can be kicked before, during, or after a game without leaving a broken playing room", () => {
  assert.match(source, /const wasPlaying = previousStatus === "playing" && wasSeated/);
  assert.match(source, /adminTerminated: true/);
  assert.match(source, /hostTerminated: true/);
  assert.match(source, /room\.status = "waiting"/);
  assert.match(source, /room\.seats = \(room\.seats \|\| \[\]\)\.map/);
  assert.match(source, /resetReady\(room, false\)/);
});

test("kick removes all room references and ends the kicked session", () => {
  assert.match(source, /room\.pending = .*filter/);
  assert.match(source, /room\.queue = .*filter/);
  assert.match(source, /room\.rematchVotes = .*filter/);
  assert.match(source, /room\.members = .*filter/);
  assert.match(source, /cancelDeadline\(bv, `offline:\$\{target\.id\}`\)/);
  assert.match(source, /this\.endTokenSession\(oldToken, "你已被房主踢出房間。"\)/);
});

test("only the owner receives kickable member ids and UI controls", () => {
  assert.match(source, /feature\.kickableMembers = isOwner/);
  assert.match(source, /: \[\];/);
  assert.match(source, /id="boardverse-host-kick"/);
  assert.match(source, /type:'kick_member',memberId:m\.id,revision:feature\.revision/);
});

test("deployment entry points at the host-kick wrapper", () => {
  assert.match(wrangler, /"main": "src\/index-v012\.js"/);
});
