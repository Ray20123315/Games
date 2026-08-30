import { MAX_JSON_BYTES } from "./config.js";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers,
    },
  });
}

export function redirect(location, status = 303, headers = {}) {
  return new Response(null, { status, headers: { location, ...headers } });
}

export function errorJson(message, status = 400, code = "bad_request") {
  return json({ ok: false, error: code, message }, status);
}

export async function readJson(request, maxBytes = MAX_JSON_BYTES) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) throw new HttpError(415, "content_type", "請使用 application/json。 ");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "too_large", "請求內容過大。");
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new HttpError(400, "invalid_json", "JSON 格式錯誤。"); }
}

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function safeInternalMessage(error) {
  const raw = String(error?.message || "");
  if (/D1_|SQLITE|database|prepare\(|statement|constraint|syntax error|Cloudflare|Durable Object/i.test(raw)) {
    return "系統資料服務暫時無法完成此操作，請稍後再試。";
  }
  return "伺服器暫時無法完成此操作，請稍後再試。";
}

export function toErrorResponse(error) {
  if (error instanceof HttpError) return errorJson(error.message, error.status, error.code);
  try { console.error("[BoardVerse internal error]", error); } catch {}
  return errorJson(safeInternalMessage(error), 500, "internal_error");
}

export function parseCookies(request) {
  const out = {};
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function cookie(name, value, { maxAge = null, path = "/", httpOnly = true, secure = true, sameSite = "Lax" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join("; ");
}

export function clearCookie(name, path = "/") {
  return cookie(name, "", { maxAge: 0, path });
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
