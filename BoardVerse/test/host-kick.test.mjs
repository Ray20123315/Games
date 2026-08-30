import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index-v012.js", import.meta.url), "utf8");
const production = fs.readFileSync(new URL("../src/index-v023.js", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("preserves historical exports and delegates through v011", () => {
  assert.match(source, /export \{ BoardVerseDb, BoardVerseDbV011, GameRoomV011, GlobalChat, GlobalChatV011 \}/);
  assert.match(source, /appV011\.fetch/);
});

test("host kick is parsed, revision checked, and owner-only", () => {
  assert.match(source, /parseWsMessage\(message\)/);
  assert.match(source, /msg\.type !== "host_kick"/);
  assert.match(source, /requireRevision\(room, msg\.revision\)/);
  assert.match(source, /assertOwner\(room, owner\)/);
  assert.match(source, /target\.id === room\.ownerId/);
});

test("active seated kick is a no-result termination without queue rotation", () => {
  assert.match(source, /const wasPlaying = previousStatus === "playing" && wasSeated/);
  assert.match(source, /room\.settings\.queueEnabled = false/);
  assert.match(source, /adminTerminated: true/);
  assert.match(source, /hostTerminated: true/);
  assert.match(source, /room\.status = "waiting"/);
});

test("kick cleans references and terminates the kicked session", () => {
  assert.match(source, /room\.pending = .*filter/);
  assert.match(source, /room\.queue = .*filter/);
  assert.match(source, /room\.seats = .*map/);
  assert.match(source, /room\.members = .*filter/);
  assert.match(source, /cancelDeadline\(bv, `offline:\$\{target\.id\}`\)/);
  assert.match(source, /this\.endTokenSession\(oldToken/);
  assert.match(source, /resetReady\(room, false\)/);
});

test("only owner feature state exposes member ids and UI sends revision", () => {
  assert.match(source, /feature\.kickableMembers = isOwner/);
  assert.match(source, /: \[\];/);
  assert.match(source, /type:'host_kick',memberId:m\.id,revision:feature\.revision/);
});

test("v024 deployment retains the v023 urgent repair compatibility layer", () => {
  assert.match(wrangler, /"main": "src\/index-v024\.js"/);
  assert.match(production, /from "\.\/index-v022\.js"/);
});
