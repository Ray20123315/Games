import { all, run } from "../core/db.js";

export async function activeAnnouncements(db, now = Date.now()) {
  return all(db, `SELECT id,title,content,type,published_at,expires_at FROM announcements
    WHERE enabled=1 AND published_at<=? AND (expires_at IS NULL OR expires_at>?)
    ORDER BY CASE type WHEN 'maintenance' THEN 3 WHEN 'important' THEN 2 ELSE 1 END DESC,published_at DESC LIMIT 20`, now, now);
}

export async function saveAnnouncement(db, input, id = null) {
  const now = Date.now();
  const type = ["normal", "important", "maintenance"].includes(input.type) ? input.type : "normal";
  const title = String(input.title || "").trim().slice(0, 120), content = String(input.content || "").trim().slice(0, 4000);
  if (!title || !content) throw new Error("公告標題與內容不可空白。");
  if (!id) {
    id = crypto.randomUUID();
    await run(db, "INSERT INTO announcements(id,title,content,type,enabled,published_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", id, title, content, type, input.enabled === false ? 0 : 1, Number(input.publishedAt) || now, input.expiresAt ? Number(input.expiresAt) : null, now, now);
  } else {
    await run(db, "UPDATE announcements SET title=?,content=?,type=?,enabled=?,published_at=?,expires_at=?,updated_at=? WHERE id=?", title, content, type, input.enabled === false ? 0 : 1, Number(input.publishedAt) || now, input.expiresAt ? Number(input.expiresAt) : null, now, id);
  }
  return id;
}
