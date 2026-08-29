import { all, run } from "../core/db.js";

export async function listRiskFlags(db, { status = null, limit = 50, offset = 0 } = {}) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 50)), off = Math.max(0, Number(offset) || 0);
  return status
    ? all(db, "SELECT * FROM risk_flags WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?", status, lim, off)
    : all(db, "SELECT * FROM risk_flags ORDER BY created_at DESC LIMIT ? OFFSET ?", lim, off);
}

export async function reviewRiskFlag(db, id, status) {
  if (!["reviewed", "dismissed", "confirmed"].includes(status)) throw new Error("Risk Flag 狀態不合法。");
  await run(db, "UPDATE risk_flags SET status=?,reviewed_at=? WHERE id=?", status, Date.now(), id);
}
