import { audit, first, run } from "../core/db.js";
import { levelPolicy } from "../membership/membership.js";

export async function applyDiscipline(db, userId, action, { reason, value = null, adminActor = "admin" } = {}) {
  const why = String(reason || "").trim().slice(0, 1000);
  if (!why) throw new Error("管理處分必須填寫原因。");
  const before = await first(db, "SELECT id,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until FROM users WHERE id=?", userId);
  if (!before) throw new Error("找不到使用者。");
  const now = Date.now();
  if (action === "warning") {
    // Audit-only warning.
  } else if (action === "reputation_set") {
    await run(db, "UPDATE users SET reputation=?,updated_at=? WHERE id=?", Math.max(0, Math.min(100, Number(value))), now, userId);
  } else if (action === "gp_delta") {
    await run(db, "UPDATE users SET gp=MAX(0,gp+?),updated_at=? WHERE id=?", Math.trunc(Number(value) || 0), now, userId);
  } else if (action === "gp_zero") {
    await run(db, "UPDATE users SET gp=0,updated_at=? WHERE id=?", now, userId);
  } else if (action === "level_set") {
    const level = Math.max(1, Math.min(5, Math.trunc(Number(value) || 1)));
    levelPolicy(level);
    await run(db, "UPDATE users SET level=?,updated_at=? WHERE id=?", level, now, userId);
  } else if (action === "suspend") {
    const until = Number(value); if (!Number.isFinite(until) || until <= now) throw new Error("停權截止時間不合法。");
    await run(db, "UPDATE users SET status='suspended',suspended_until=?,updated_at=? WHERE id=?", until, now, userId);
    await run(db, "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", now, userId);
  } else if (action === "ban") {
    await run(db, "UPDATE users SET status='banned',suspended_until=NULL,updated_at=? WHERE id=?", now, userId);
    await run(db, "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", now, userId);
  } else if (action === "restore") {
    await run(db, "UPDATE users SET status='active',suspended_until=NULL,updated_at=? WHERE id=?", now, userId);
  } else if (action === "revoke_sessions") {
    await run(db, "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", now, userId);
  } else if (action === "custom_room_suspend") {
    const until = Number(value); if (!Number.isFinite(until) || until <= now) throw new Error("限制截止時間不合法。");
    await run(db, "UPDATE users SET custom_room_suspended_until=?,updated_at=? WHERE id=?", until, now, userId);
  } else if (action === "custom_room_restore") {
    await run(db, "UPDATE users SET custom_room_suspended_until=NULL,updated_at=? WHERE id=?", now, userId);
  } else if (action === "unlimited_custom_room") {
    await run(db, "UPDATE users SET unlimited_custom_room_id=?,updated_at=? WHERE id=?", value ? 1 : 0, now, userId);
  } else if (["mute_global","mute_room","mute_all_chat"].includes(action)) {
    const until = Number(value); if (!Number.isFinite(until) || until <= now) throw new Error("Mute 截止時間不合法。");
    const channels = action === "mute_all_chat" ? ["global","room"] : [action === "mute_room" ? "room" : "global"];
    for (const channel of channels) await run(db, `INSERT INTO chat_mutes(subject_type,subject_id,channel,muted_until,reason,created_at)
      VALUES('user',?,?,?,?,?) ON CONFLICT(subject_type,subject_id,channel) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason`, userId, channel, until, why, now);
  } else throw new Error("未知處分動作。");
  const after = await first(db, "SELECT id,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until FROM users WHERE id=?", userId);
  await run(db, "INSERT INTO disciplinary_actions(id,user_id,action_type,reason,before_json,after_json,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)", crypto.randomUUID(), userId, action, why, JSON.stringify(before), JSON.stringify(after), now, action === "suspend" || action === "custom_room_suspend" || action.startsWith("mute_") ? Number(value) : null, now);
  await audit(db, `discipline.${action}`, { adminActor, targetType: "user", targetId: userId, reason: why, before, after });
  return { before, after };
}

export async function confirmCheatingDefault(db, userId, { reason, suspendedUntil, adminActor = "admin" }) {
  if (!Number.isFinite(Number(suspendedUntil)) || Number(suspendedUntil) <= Date.now()) throw new Error("請指定有效的停權期限。");
  const before = await first(db, "SELECT id,status,suspended_until,gp,level,reputation FROM users WHERE id=?", userId);
  const now = Date.now();
  await run(db, "UPDATE users SET reputation=0,gp=0,level=1,status='suspended',suspended_until=?,updated_at=? WHERE id=?", Number(suspendedUntil), now, userId);
  await run(db, "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", now, userId);
  const after = await first(db, "SELECT id,status,suspended_until,gp,level,reputation FROM users WHERE id=?", userId);
  await run(db, "INSERT INTO disciplinary_actions(id,user_id,action_type,reason,before_json,after_json,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)", crypto.randomUUID(), userId, "confirmed_cheating_default", reason, JSON.stringify(before), JSON.stringify(after), now, Number(suspendedUntil), now);
  await audit(db, "discipline.confirmed_cheating", { adminActor, targetType: "user", targetId: userId, reason, before, after });
  return { before, after };
}
