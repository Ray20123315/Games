import { EMAIL_VERIFY_MS, PASSWORD_RESET_MS, PBKDF2_ITERATIONS } from "../core/config.js";
import { pbkdf2Hash, randomToken, sha256Hex, verifyPbkdf2 } from "../core/crypto.js";
import { first, run } from "../core/db.js";
import { HttpError, clientIp } from "../core/http.js";
import { EmailService } from "../email/email-service.js";
import { createUserSession, revokeAllUserSessions } from "./sessions.js";

function usernameDisplay(v) { return String(v || "").normalize("NFKC").trim().slice(0, 24); }
function usernameKey(v) { return usernameDisplay(v).toLocaleLowerCase("en-US"); }
function emailKey(v) { return String(v || "").normalize("NFKC").trim().toLocaleLowerCase("en-US").slice(0, 254); }
function adminUsernameKey(env) { return usernameKey(env?.ADMIN_USERNAME || ""); }
function validateUsername(v) { return /^[\p{L}\p{N}_.-]{3,24}$/u.test(v); }
function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validatePassword(v) { return typeof v === "string" && v.length >= 10 && v.length <= 128; }

async function emailRateGuard(db, key, kind, cooldownMs, dailyMax) {
  const now = Date.now(), day = Math.floor(now / 86_400_000);
  const row = await first(db, "SELECT window_key,count,last_sent_at FROM email_rate_limits WHERE rate_key=? AND kind=?", key, kind);
  if (row && Number(row.last_sent_at || 0) + cooldownMs > now) throw new HttpError(429, "email_cooldown", "請稍後再要求寄送 Email。");
  const count = row?.window_key === String(day) ? Number(row.count || 0) : 0;
  if (count >= dailyMax) throw new HttpError(429, "email_daily_limit", "今天的 Email 寄送次數已達上限。");
  await run(db, `INSERT INTO email_rate_limits(rate_key,kind,window_key,count,last_sent_at) VALUES(?,?,?,?,?)
    ON CONFLICT(rate_key,kind) DO UPDATE SET window_key=excluded.window_key,count=CASE WHEN email_rate_limits.window_key=excluded.window_key THEN email_rate_limits.count+1 ELSE 1 END,last_sent_at=excluded.last_sent_at`, key, kind, String(day), 1, now);
}

async function createEmailToken(db, userId, type, ttlMs) {
  const raw = randomToken(32), hash = await sha256Hex(raw), now = Date.now();
  await run(db, "UPDATE email_tokens SET used_at=? WHERE user_id=? AND type=? AND used_at IS NULL", now, userId, type);
  await run(db, "INSERT INTO email_tokens(id,user_id,type,token_hash,expires_at,used_at,created_at) VALUES(?,?,?,?,?,NULL,?)", crypto.randomUUID(), userId, type, hash, now + ttlMs, now);
  return raw;
}

export async function registerUser(db, env, request, input, baseUrl) {
  const username = usernameDisplay(input.username), normalized = usernameKey(username), email = emailKey(input.email), password = String(input.password || "");
  if (!validateUsername(username)) throw new HttpError(400, "username_invalid", "Username 需為 3～24 個字元，可使用文字、數字、_ . -。 ");
  if (normalized && normalized === adminUsernameKey(env)) throw new HttpError(409, "account_exists", "此 Username 已保留給管理員帳號。");
  if (!validateEmail(email)) throw new HttpError(400, "email_invalid", "Email 格式不正確。");
  if (!validatePassword(password)) throw new HttpError(400, "password_invalid", "密碼需為 10～128 個字元。");
  const existing = await first(db, "SELECT id FROM users WHERE username_normalized=? OR email_normalized=? LIMIT 1", normalized, email);
  if (existing) throw new HttpError(409, "account_exists", "此 Username 或 Email 已被使用。");
  const record = await pbkdf2Hash(password, undefined, PBKDF2_ITERATIONS);
  const now = Date.now(), id = crypto.randomUUID();
  await run(db, `INSERT INTO users(id,username_normalized,username_display,email_normalized,email_verified_at,password_algorithm,password_iterations,password_salt,password_hash,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until,created_at,updated_at)
    VALUES(?,?,?,?,NULL,?,?,?,?, 'active',NULL,0,1,100,0,NULL,?,?)`, id, normalized, username, email, record.algorithm, record.iterations, record.salt, record.hash, now, now);
  await sendVerification(db, env, request, id, email, baseUrl);
  return { id, username, email, pendingVerification: true };
}

export async function sendVerification(db, env, request, userId, email, baseUrl) {
  const ipHash = await sha256Hex(clientIp(request));
  await emailRateGuard(db, `verify:${email}`, "verify", 60_000, 5);
  await emailRateGuard(db, `verify-ip:${ipHash}`, "verify", 30_000, 15);
  const raw = await createEmailToken(db, userId, "verify", EMAIL_VERIFY_MS);
  const link = `${baseUrl}/verify?token=${encodeURIComponent(raw)}`;
  await new EmailService(env).send({ to: email, subject: "BoardVerse Email 驗證", html: `<p>請使用以下連結完成 BoardVerse Email 驗證：</p><p><a href="${link}">${link}</a></p><p>連結 24 小時內有效。</p>` });
}

export async function resendVerification(db, env, request, identifier, baseUrl) {
  const key = String(identifier || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (!key || key === adminUsernameKey(env)) return { accepted: true };
  const user = await first(db, "SELECT id,email_normalized,email_verified_at FROM users WHERE username_normalized=? OR email_normalized=? LIMIT 1", key, key);
  if (!user || user.email_verified_at) return { accepted: true };
  await sendVerification(db, env, request, user.id, user.email_normalized, baseUrl);
  return { accepted: true };
}

export async function verifyEmailToken(db, raw) {
  const hash = await sha256Hex(raw), now = Date.now();
  const token = await first(db, "SELECT * FROM email_tokens WHERE type='verify' AND token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1", hash, now);
  if (!token) throw new HttpError(400, "token_invalid", "驗證連結無效或已過期。");
  await run(db, "UPDATE email_tokens SET used_at=? WHERE id=?", now, token.id);
  await run(db, "UPDATE users SET email_verified_at=?,updated_at=? WHERE id=?", now, now, token.user_id);
  return token.user_id;
}

export async function loginUser(db, identifier, password) {
  const key = String(identifier || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const user = await first(db, "SELECT * FROM users WHERE username_normalized=? OR email_normalized=? LIMIT 1", key, key);
  const generic = new HttpError(401, "login_failed", "帳號或密碼錯誤，或帳號目前無法登入。");
  if (!user?.password_hash || !await verifyPbkdf2(password, { salt: user.password_salt, hash: user.password_hash, iterations: user.password_iterations })) throw generic;
  const now = Date.now();
  if (!user.email_verified_at) throw new HttpError(403, "email_unverified", "請先完成 Email 驗證。");
  if (user.status === "suspended" && Number(user.suspended_until || 0) <= now) {
    await run(db, "UPDATE users SET status='active',suspended_until=NULL,updated_at=? WHERE id=?", now, user.id);
    user.status = "active"; user.suspended_until = null;
  }
  if (user.status !== "active" || (user.suspended_until && Number(user.suspended_until) > now)) throw generic;
  return { user, session: await createUserSession(db, user.id) };
}

export async function requestPasswordReset(db, env, request, identifier, baseUrl) {
  const key = String(identifier || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (key && key === adminUsernameKey(env)) return { accepted: true };
  const user = await first(db, "SELECT id,email_normalized FROM users WHERE username_normalized=? OR email_normalized=? LIMIT 1", key, key);
  if (!user) return { accepted: true };
  const ipHash = await sha256Hex(clientIp(request));
  await emailRateGuard(db, `reset:${user.email_normalized}`, "reset", 60_000, 5);
  await emailRateGuard(db, `reset-ip:${ipHash}`, "reset", 30_000, 15);
  const raw = await createEmailToken(db, user.id, "password_reset", PASSWORD_RESET_MS);
  const link = `${baseUrl}/reset?token=${encodeURIComponent(raw)}`;
  await new EmailService(env).send({ to: user.email_normalized, subject: "BoardVerse 密碼重設", html: `<p>請使用以下連結重設密碼：</p><p><a href="${link}">${link}</a></p><p>連結 30 分鐘內有效。</p>` });
  return { accepted: true };
}

export async function resetPassword(db, rawToken, password) {
  if (!validatePassword(password)) throw new HttpError(400, "password_invalid", "密碼需為 10～128 個字元。");
  const hash = await sha256Hex(rawToken), now = Date.now();
  const token = await first(db, "SELECT * FROM email_tokens WHERE type IN ('password_reset','admin_activation') AND token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1", hash, now);
  if (!token) throw new HttpError(400, "token_invalid", "重設連結無效或已過期。");
  const record = await pbkdf2Hash(password, undefined, PBKDF2_ITERATIONS);
  await run(db, "UPDATE users SET password_algorithm=?,password_iterations=?,password_salt=?,password_hash=?,status='active',updated_at=? WHERE id=?", record.algorithm, record.iterations, record.salt, record.hash, now, token.user_id);
  await run(db, "UPDATE email_tokens SET used_at=? WHERE id=?", now, token.id);
  await revokeAllUserSessions(db, token.user_id);
  return token.user_id;
}

export async function createAdminActivation(db, { username, email }) {
  const display = usernameDisplay(username), normalized = usernameKey(display), mail = emailKey(email);
  if (!validateUsername(display) || !validateEmail(mail)) throw new HttpError(400, "invalid_account", "Username 或 Email 格式錯誤。");
  const existing = await first(db, "SELECT id FROM users WHERE username_normalized=? OR email_normalized=?", normalized, mail);
  if (existing) throw new HttpError(409, "account_exists", "此 Username 或 Email 已被使用。");
  const id = crypto.randomUUID(), now = Date.now();
  await run(db, `INSERT INTO users(id,username_normalized,username_display,email_normalized,email_verified_at,password_algorithm,password_iterations,password_salt,password_hash,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until,created_at,updated_at)
    VALUES(?,?,?,?,?,'PBKDF2-HMAC-SHA-256',?,NULL,NULL,'active',NULL,0,1,100,0,NULL,?,?)`, id, normalized, display, mail, now, PBKDF2_ITERATIONS, now, now);
  const raw = await createEmailToken(db, id, "admin_activation", EMAIL_VERIFY_MS);
  return { userId: id, token: raw };
}

export async function activateAdminUser(db, rawToken, password) {
  if (!validatePassword(password)) throw new HttpError(400, "password_invalid", "密碼需為 10～128 個字元。");
  const hash = await sha256Hex(rawToken), now = Date.now();
  const token = await first(db, "SELECT * FROM email_tokens WHERE type='admin_activation' AND token_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1", hash, now);
  if (!token) throw new HttpError(400, "token_invalid", "啟用連結無效或已過期。");
  const record = await pbkdf2Hash(password, undefined, PBKDF2_ITERATIONS);
  await run(db, "UPDATE users SET password_algorithm=?,password_iterations=?,password_salt=?,password_hash=?,email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?", record.algorithm, record.iterations, record.salt, record.hash, now, now, token.user_id);
  await run(db, "UPDATE email_tokens SET used_at=? WHERE id=?", now, token.id);
  return token.user_id;
}
