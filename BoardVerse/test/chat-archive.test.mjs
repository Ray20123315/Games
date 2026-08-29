import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync(new URL("../src/db/schema.js", import.meta.url), "utf8");
const archive = fs.readFileSync(new URL("../src/chat/archive.js", import.meta.url), "utf8");
const globalChat = fs.readFileSync(new URL("../src/chat/GlobalChat.js", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../src/index-v012.js", import.meta.url), "utf8");

test("chat archive schema tracks automatic deletion time", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS chat_archive/);
  assert.match(schema, /delete_after INTEGER NOT NULL/);
  assert.match(schema, /idx_chat_archive_delete/);
});

test("chat retention is exactly 60 days", () => {
  assert.match(archive, /CHAT_RETENTION_MS = 60 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(archive, /DELETE FROM chat_archive WHERE delete_after<=\?/);
});

test("global and room chat are both archived", () => {
  assert.match(globalChat, /channel: "global"/);
  assert.match(globalChat, /archiveChatMessage/);
  assert.match(entry, /async handleChat\(token, text\)/);
  assert.match(entry, /channel: "room"/);
  assert.match(entry, /archiveChatMessage\(this\.env\.BOARDVERSE_DB/);
});

test("admins can read the retained chat archive", () => {
  assert.match(entry, /\/admin\/api\/chat-archive/);
  assert.match(entry, /await requireAdmin\(effectiveEnv, request\)/);
  assert.match(entry, /retentionDays: 60/);
});

test("scheduled maintenance removes expired chat records", () => {
  assert.match(entry, /cleanupChatArchive\(effectiveEnv\.BOARDVERSE_DB, Date\.now\(\)\)/);
});
