import { ADMIN_COOKIE, ADMIN_PLAYER_COOKIE, ADMIN_SESSION_MS } from "../core/config.js";
import { constantTimeEqual, randomToken, sha256Hex, signPayload, verifySignedPayload } from "../core/crypto.js";
import { first, run } from "../core/db.js";
import { cookie, parseCookies, clientIp, HttpError } from "../core/http.js";

export async function adminLogin(db, env, request, username, password) {
  if (!env?.ADMIN_USERNAME || !env?.ADMIN_PASSWORD || !env?.ADMIN_SESSION_SECRET) throw new HttpError(503, "admin_unconfigured", "管理員 Secrets 尚未完整設定。");
  const ipHash = await sha256Hex(`${clientIp(request)}|${env.ADMIN_SESSION_SECRET}`);
  const now = Date.now(), windowStart = now - 15 * 60_000;
  const old = await first(db, "SELECT window_start,failure_count,blocked_until FROM admin_login_attempts WHERE ip_hash=?", ipHash);
  if (Number(old?.blocked_until || 0) > now) throw new HttpError(429, "admin_locked", "登入嘗試過多，請稍後再試。");
  const valid = constantTimeEqual(String(username || ""), String(env.ADMIN_USERNAME)) && constantTimeEqual(String(password || ""), String(env.ADMIN_PASSWORD));
  if (!valid) {
    let count = Number(old?.failure_count || 0), start = Number(old?.window_start || now);
    if (start < windowStart) { count = 0; start = now; }
    count += 1;
    const blocked = count >= 5 ? now + 15 * 60_000 : null;
    await run(db, `INSERT INTO admin_login_attempts(ip_hash,window_start,failure_count,blocked_until,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(ip_hash) DO UPDATE SET window_start=excluded.window_start,failure_count=excluded.failure_count,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at`, ipHash, start, count, blocked, now);
    throw new HttpError(401, "admin_login_failed", "管理員登入失敗。");
  }
  await run(db, "DELETE FROM admin_login_attempts WHERE ip_hash=?", ipHash);
  const payload = { iat: now, exp: now + ADMIN_SESSION_MS, nonce: randomToken(18), user: String(env.ADMIN_USERNAME) };
  const token = await signPayload(env.ADMIN_SESSION_SECRET, payload);
  return { payload, setCookie: cookie(ADMIN_COOKIE, token, { maxAge: ADMIN_SESSION_MS / 1000, path: "/admin", sameSite: "Strict" }) };
}

export async function requireAdmin(env, request) {
  if (!env?.ADMIN_SESSION_SECRET) throw new HttpError(503, "admin_unconfigured", "ADMIN_SESSION_SECRET 尚未設定。");
  const token = parseCookies(request)[ADMIN_COOKIE];
  const payload = await verifySignedPayload(env.ADMIN_SESSION_SECRET, token);
  if (!payload || Number(payload.exp) <= Date.now() || payload.user !== String(env.ADMIN_USERNAME || "")) throw new HttpError(401, "admin_required", "請先登入管理後台。");
  return payload;
}


export async function issueAdminPlayerEntitlement(env) {
  if (!env?.ADMIN_SESSION_SECRET || !env?.ADMIN_USERNAME) throw new HttpError(503, "admin_unconfigured", "管理員 Secrets 尚未完整設定。");
  const now = Date.now(), maxAgeMs = 2 * 60 * 60 * 1000;
  const token = await signPayload(env.ADMIN_SESSION_SECRET, { kind: "admin_player", user: String(env.ADMIN_USERNAME), iat: now, exp: now + maxAgeMs, nonce: randomToken(18) });
  return cookie(ADMIN_PLAYER_COOKIE, token, { maxAge: maxAgeMs / 1000, path: "/", sameSite: "Lax" });
}

export async function adminPlayerEntitlement(env, request) {
  if (!env?.ADMIN_SESSION_SECRET || !env?.ADMIN_USERNAME) return null;
  const token = parseCookies(request)[ADMIN_PLAYER_COOKIE];
  const payload = await verifySignedPayload(env.ADMIN_SESSION_SECRET, token);
  if (!payload || payload.kind !== "admin_player" || payload.user !== String(env.ADMIN_USERNAME) || Number(payload.exp) <= Date.now()) return null;
  return payload;
}
