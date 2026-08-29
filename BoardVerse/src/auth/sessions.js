import { USER_COOKIE, USER_SESSION_MS } from "../core/config.js";
import { randomToken, sha256Hex } from "../core/crypto.js";
import { first, run } from "../core/db.js";
import { cookie, parseCookies } from "../core/http.js";

export async function createUserSession(db, userId, now = Date.now()) {
  const raw = randomToken(32);
  const hash = await sha256Hex(raw);
  const expires = now + USER_SESSION_MS;
  await run(db, "INSERT INTO user_sessions(id,user_id,token_hash,created_at,expires_at,last_seen_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)", crypto.randomUUID(), userId, hash, now, expires, now);
  return { raw, expiresAt: expires, setCookie: cookie(USER_COOKIE, raw, { maxAge: USER_SESSION_MS / 1000, sameSite: "Lax" }) };
}

export async function sessionUser(db, request, { touch = true } = {}) {
  const raw = parseCookies(request)[USER_COOKIE];
  if (!raw) return null;
  const hash = await sha256Hex(raw);
  const now = Date.now();
  const row = await first(db, `SELECT u.*,s.id AS session_id,s.expires_at AS session_expires
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1`, hash, now);
  if (!row) return null;
  if (row.status === "banned" || row.status === "disabled") return null;
  if (row.status === "suspended" && Number(row.suspended_until || 0) > now) return null;
  if (row.status === "suspended") { await run(db, "UPDATE users SET status='active',suspended_until=NULL,updated_at=? WHERE id=?", now, row.id); row.status="active"; row.suspended_until=null; }
  if (touch) await run(db, "UPDATE user_sessions SET last_seen_at=? WHERE id=?", now, row.session_id);
  return row;
}

export async function revokeCurrentSession(db, request) {
  const raw = parseCookies(request)[USER_COOKIE];
  if (!raw) return;
  const hash = await sha256Hex(raw);
  await run(db, "UPDATE user_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL", Date.now(), hash);
}

export async function revokeAllUserSessions(db, userId) {
  await run(db, "UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", Date.now(), userId);
}
