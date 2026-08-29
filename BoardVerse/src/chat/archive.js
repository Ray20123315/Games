import { all, run } from "../core/db.js";

export const CHAT_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

export async function archiveChatMessage(db, {
  id = crypto.randomUUID(),
  channel,
  roomId = null,
  senderKind = "guest",
  senderId = null,
  senderName = "Guest",
  text,
  createdAt = Date.now(),
} = {}) {
  if (!db) return null;
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;
  const at = Number(createdAt) || Date.now();
  const deleteAfter = at + CHAT_RETENTION_MS;
  await run(db, `INSERT INTO chat_archive(id,channel,room_id,sender_kind,sender_id,sender_name,message_text,created_at,delete_after)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    String(id), String(channel || "room"), roomId == null ? null : String(roomId), String(senderKind || "guest"),
    senderId == null ? null : String(senderId), String(senderName || "Guest").slice(0, 80), cleanText, at, deleteAfter);
  return { id: String(id), deleteAfter };
}

export async function cleanupChatArchive(db, now = Date.now()) {
  if (!db) return 0;
  const result = await run(db, "DELETE FROM chat_archive WHERE delete_after<=?", Number(now) || Date.now());
  return Number(result?.meta?.changes || result?.changes || 0);
}

export async function listChatArchive(db, { channel = null, roomId = null, q = "", limit = 100, offset = 0 } = {}) {
  const where = [];
  const binds = [];
  if (channel === "global" || channel === "room") { where.push("channel=?"); binds.push(channel); }
  if (roomId) { where.push("room_id=?"); binds.push(String(roomId).toUpperCase()); }
  const query = String(q || "").trim();
  if (query) {
    where.push("(sender_name LIKE ? OR message_text LIKE ?)");
    const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
    binds.push(like, like);
  }
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)));
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));
  const sql = `SELECT id,channel,room_id,sender_kind,sender_id,sender_name,message_text,created_at,delete_after
    FROM chat_archive ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  return all(db, sql, ...binds, safeLimit, safeOffset);
}
