import { ensureFeatureState } from "../room/state.js";
import { ensureEmergencySchema } from "./d1-mode.js";
import { signPayload, verifySignedPayload } from "../core/crypto.js";

function cleanRoomId(value) {
  const roomId = String(value || "").trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(roomId) ? roomId : null;
}

function cleanIdentity(value, fallbackName = "Member") {
  const role = ["owner", "admin", "member", "guest"].includes(value?.role) ? value.role : "guest";
  const name = String(value?.name || fallbackName).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || fallbackName;
  if (role === "owner") return { role, badge: "OWNER", level: null, name };
  if (role === "admin") return { role, badge: "ADMIN", level: null, name };
  if (role === "member") {
    const level = Math.max(1, Math.min(999, Math.trunc(Number(value?.level) || 1)));
    return { role, badge: `Lv.${level}`, level, name };
  }
  return { role: "guest", badge: "訪客", level: null, name };
}

export async function attachEmergencyRoomIdentity(db, roomIdValue, tokenValue, resolved) {
  const roomId = cleanRoomId(roomIdValue), token = String(tokenValue || "").trim();
  if (!db || !roomId || !token || !resolved?.identity) return false;

  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await db.prepare("SELECT revision,room_json FROM emergency_rooms WHERE room_id=? AND expires_at>?")
      .bind(roomId, Date.now()).first();
    if (!row?.room_json) return false;
    let room;
    try { room = JSON.parse(row.room_json); } catch { return false; }
    const member = (room.members || []).find((m) => String(m?.token || "") === token);
    if (!member) return false;

    const bv = ensureFeatureState(room);
    if (!bv.memberIdentities || typeof bv.memberIdentities !== "object") bv.memberIdentities = {};
    if (!bv.memberUsers || typeof bv.memberUsers !== "object") bv.memberUsers = {};
    bv.memberIdentities[member.id] = cleanIdentity(resolved.identity, member.name || "Member");
    if (resolved.userId) bv.memberUsers[member.id] = String(resolved.userId);

    const now = Date.now();
    room.updatedAt = now;
    const result = await db.prepare("UPDATE emergency_rooms SET revision=revision+1,room_json=?,updated_at=? WHERE room_id=? AND revision=?")
      .bind(JSON.stringify(room), now, roomId, Number(row.revision || 0)).run();
    if (Number(result?.meta?.changes || result?.changes || 0) > 0) return true;
  }
  return false;
}

export async function issueEmergencyChatIdentity(env, resolved) {
  if (!env?.ADMIN_SESSION_SECRET || !resolved?.identity) return null;
  const identity = cleanIdentity(resolved.identity, resolved.name || "Member");
  const now = Date.now();
  return signPayload(env.ADMIN_SESSION_SECRET, {
    kind: identity.role === "admin" ? "admin" : "user",
    id: String(resolved.userId || ""),
    name: identity.name,
    role: identity.role,
    badge: identity.badge,
    level: identity.level,
    iat: now,
    exp: now + 2 * 60 * 60 * 1000,
    scope: "emergency-global-chat",
  });
}

export async function postAuthenticatedEmergencyGlobal(db, env, request) {
  if (!db || !env?.ADMIN_SESSION_SECRET) return null;
  const body = await request.clone().json().catch(() => ({}));
  const token = String(body.identity || "");
  const payload = await verifySignedPayload(env.ADMIN_SESSION_SECRET, token).catch(() => null);
  if (!payload || payload.scope !== "emergency-global-chat" || Number(payload.exp || 0) <= Date.now()) return null;
  const text = String(body.text || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 300);
  if (!text) return new Response(JSON.stringify({ ok:false, code:"bad_chat", message:"聊天訊息無效。" }), { status:400, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"} });
  await ensureEmergencySchema(db);
  const id = crypto.randomUUID(), at = Date.now();
  const badge = String(payload.badge || "會員").slice(0, 16), rawName = String(payload.name || "Member").slice(0, 40);
  const name = `${badge} · ${rawName}`;
  const result = await db.prepare("INSERT INTO emergency_global_chat(id,sender_key,sender_name,message_text,created_at) VALUES(?,?,?,?,?)")
    .bind(id, String(payload.id || payload.kind || "user"), name, text, at).run();
  if (Number(result?.meta?.changes || result?.changes || 0) < 1) return null;
  return new Response(JSON.stringify({ ok:true, message:{ id, name, text, at }, emergency:true }), { headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"} });
}
