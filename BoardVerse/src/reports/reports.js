import { MAX_REPORT_TEXT } from "../core/config.js";
import { all, run } from "../core/db.js";
import { HttpError, clientIp } from "../core/http.js";
import { sha256Hex } from "../core/crypto.js";

const TYPES = new Set(["bug", "player", "cheating", "boosting", "room", "chat", "voice", "other", "appeal"]);

export async function verifyTurnstile(env, token, request) {
  if (!env?.TURNSTILE_SECRET_KEY) throw new HttpError(503, "turnstile_unconfigured", "TURNSTILE_SECRET_KEY 尚未設定，暫時不能送出回報。");
  if (!token) throw new HttpError(400, "turnstile_required", "請先完成 Turnstile 驗證。");
  const body = new FormData();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  const ip = clientIp(request); if (ip !== "unknown") body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const result = await response.json().catch(() => ({}));
  if (!result.success) throw new HttpError(400, "turnstile_failed", "Turnstile 驗證失敗，請重新驗證。");
  return true;
}

export async function createReport(db, env, request, input, reporter = {}) {
  await verifyTurnstile(env, input.turnstileToken, request);
  const type = TYPES.has(input.type) ? input.type : "other";
  if (type === "appeal" && !reporter.userId) throw new HttpError(401, "appeal_login_required", "處分申訴必須先登入，避免冒用他人帳號。 ");
  const description = String(input.description || "").trim().slice(0, MAX_REPORT_TEXT);
  if (description.length < 8) throw new HttpError(400, "report_too_short", "請提供更完整的回報說明。");
  const ipRiskKey = await sha256Hex(clientIp(request));
  const since = Date.now() - 60 * 60 * 1000;
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM reports WHERE reporter_risk_key=? AND created_at>?").bind(ipRiskKey, since).first();
  if (Number(recent?.n || 0) >= 5) throw new HttpError(429, "report_rate_limit", "短時間內回報次數過多，請稍後再試。");
  const id = crypto.randomUUID(), now = Date.now();
  await run(db, `INSERT INTO reports(id,reporter_user_id,reporter_guest_key,reporter_risk_key,type,description,room_id,game_id,replay_id,target_user_id,current_url,status,admin_note,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',NULL,?,?)`, id, reporter.userId || null, reporter.guestKey || null, ipRiskKey, type, description, clean(input.roomId, 32), clean(input.gameId, 64), clean(input.replayId, 64), type === "appeal" ? reporter.userId : clean(input.targetUserId, 64), clean(input.currentUrl, 500), now, now);
  return { id, status: "pending" };
}

export async function listReports(db, { status = null, type = null, limit = 50, offset = 0 } = {}) {
  const where = [], binds = [];
  if (status) { where.push("status=?"); binds.push(status); }
  if (type) { where.push("type=?"); binds.push(type); }
  const sql = `SELECT * FROM reports${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  binds.push(Math.max(1, Math.min(100, Number(limit) || 50)), Math.max(0, Number(offset) || 0));
  return all(db, sql, ...binds);
}

export async function updateReport(db, id, status, note = null) {
  if (!["pending", "in_progress", "resolved", "rejected"].includes(status)) throw new Error("回報狀態不合法。");
  await run(db, "UPDATE reports SET status=?,admin_note=?,updated_at=? WHERE id=?", status, note == null ? null : String(note).slice(0, 4000), Date.now(), id);
}

function clean(v, max) { const s = String(v || "").trim().slice(0, max); return s || null; }
