import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(path.join(root, "src/db/schema.js"), "utf8");
const startMarker = "String.raw`";
const start = raw.indexOf(startMarker);
const end = raw.lastIndexOf("`;");

assert.notEqual(start, -1, "src/db/schema.js must contain String.raw template SQL");
assert.ok(end > start, "src/db/schema.js must contain a closing SQL template literal");

const sql = raw.slice(start + startMarker.length, end);
const fileSql = readFileSync(path.join(root, "schema/boardverse.sql"), "utf8");
assert.equal(fileSql.trim(), sql.trim(), "schema/boardverse.sql must match embedded DB_SCHEMA");

const db = new DatabaseSync(":memory:");
try {
  db.exec(sql);
  const tables = new Set(
    db
      .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
      .all()
      .map((row) => row.name),
  );
  const required = new Set([
    "users",
    "user_sessions",
    "email_tokens",
    "daily_user_stats",
    "opponent_daily_gp",
    "room_presets",
    "replays",
    "replay_events",
    "announcements",
    "reports",
    "risk_flags",
    "disciplinary_actions",
    "audit_logs",
    "system_settings",
    "admin_login_attempts",
    "user_login_attempts",
    "chat_mutes",
    "active_rooms",
  ]);
  const missing = [...required].filter((name) => !tables.has(name));
  assert.deepEqual(missing, [], `missing required schema tables: ${missing.join(", ")}`);
  console.log(`schema.test: PASS (${tables.size} tables)`);
} finally {
  db.close();
}
