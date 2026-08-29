import { PBKDF2_ITERATIONS } from "./config.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Bytes(value) {
  const data = value instanceof Uint8Array ? value : enc.encode(String(value));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function sha256Hex(value) {
  return [...await sha256Bytes(value)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  const x = typeof a === "string" ? enc.encode(a) : a;
  const y = typeof b === "string" ? enc.encode(b) : b;
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i % x.length] || 0) ^ (y[i % y.length] || 0);
  return diff === 0;
}

export async function pbkdf2Hash(password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { algorithm: "PBKDF2-HMAC-SHA-256", iterations, salt: base64url(salt), hash: base64url(new Uint8Array(bits)) };
}

export async function verifyPbkdf2(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const fresh = await pbkdf2Hash(password, fromBase64url(record.salt), Number(record.iterations) || PBKDF2_ITERATIONS);
  return constantTimeEqual(fresh.hash, record.hash);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacSign(secret, value) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(String(value)));
  return base64url(new Uint8Array(sig));
}

export async function hmacVerify(secret, value, signature) {
  try { return crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(signature), enc.encode(String(value))); }
  catch { return false; }
}

export async function signPayload(secret, payload) {
  const body = base64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmacSign(secret, body)}`;
}

export async function verifySignedPayload(secret, token) {
  const [body, sig, extra] = String(token || "").split(".");
  if (!body || !sig || extra || !await hmacVerify(secret, body, sig)) return null;
  try { return JSON.parse(dec.decode(fromBase64url(body))); } catch { return null; }
}
