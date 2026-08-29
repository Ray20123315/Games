import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../src/admin/context-actions.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/admin/context-bulk-ui.js", import.meta.url), "utf8");
const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");

assert.match(api, /\/admin\/api\/rooms\/bulk-action/);
assert.match(api, /\/admin\/api\/replays\/bulk-action/);
assert.match(api, /DELETE FROM replay_events WHERE replay_id=\?/);
assert.match(api, /DELETE FROM replays WHERE id=\?/);
assert.ok(api.indexOf("DELETE FROM replay_events") < api.indexOf("DELETE FROM replays"));
assert.match(api, /UPDATE replays SET public_until=\?/);
assert.match(api, /REPLAY_PUBLIC_MS/);
assert.match(api, /replay\.unpublish/);
assert.match(api, /replay\.publish/);
assert.match(api, /replay\.delete/);
assert.match(api, /BULK_LIMIT = 20/);

assert.match(ui, /boardverse-admin-context-bulk/);
assert.match(ui, /ctx-room-bulk/);
assert.match(ui, /ctx-replay-bulk/);
assert.match(ui, /ctx-row-check/);
assert.match(ui, /ctx-replay-manage/);
assert.match(ui, /改為不公開/);
assert.match(ui, /恢復公開 7 天/);
assert.match(ui, /永久刪除/);
assert.doesNotMatch(ui, /prompt\s*\(/);
assert.doesNotMatch(ui, /confirm\s*\(/);
assert.doesNotMatch(ui, /alert\s*\(/);

assert.match(entry, /ADMIN_CONTEXT_BULK_SCRIPT/);
assert.match(entry, /isContextAdminApi/);
assert.match(entry, /contextAdminApi/);
assert.match(entry, /requireAdmin/);
assert.match(entry, /requireDb/);

console.log("admin-context-bulk.test: PASS (room bulk + replay visibility/delete)");
