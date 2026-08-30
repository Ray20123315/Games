import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index-v017.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(source, /ROOM_CHAT_MODERATION_TTL_MS = 15_000/);
assert.match(source, /async assertRoomChatModeration\(member\)/);
assert.match(source, /SELECT\s+[\s\S]*status FROM users[\s\S]*MAX\(muted_until\)[\s\S]*channel IN \('room','all'\)/);
assert.match(source, /async persistRoomChatOnly\(\)/);
assert.match(source, /this\.ctx\.storage\.put\("room", this\.room\)/);
assert.match(source, /await this\.updateOfflineAlarm\(\)/);

const roomChat = source.match(/async handleChat\(token, text\)[\s\S]*?\n  }\n}\nexport class GameRoomV017/)?.[0] || "";
assert.ok(roomChat, "v017 room chat override missing");
assert.doesNotMatch(roomChat, /syncLobby\(/, "room chat must not wake the lobby Durable Object");
assert.doesNotMatch(roomChat, /this\.saveRoom\(/, "room chat must not use the active_rooms-writing saveRoom override");
assert.match(roomChat, /persistRoomChatOnly\(\)/);
assert.match(roomChat, /broadcastState\(\)/);

assert.match(source, /GLOBAL_POLICY_TTL_MS = 60_000/);
assert.match(source, /GLOBAL_MUTE_TTL_MS = 15_000/);
assert.match(source, /GLOBAL_ARCHIVE_BATCH = 8/);
assert.match(source, /SELECT key,value_json FROM system_settings WHERE key IN/);
assert.match(source, /INSERT OR IGNORE INTO chat_archive/);
assert.match(source, /chatArchiveCursorId/);
assert.match(source, /ctx\.waitUntil\(this\.flushArchive/);
assert.doesNotMatch(source, /archiveChatMessage\(/, "global chat must batch archive instead of one DB call per message");
assert.match(wrangler, /"main": "src\/index-v021\.js"/);

console.log("chat-efficiency.test: PASS");
