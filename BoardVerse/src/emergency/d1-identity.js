import { ensureFeatureState } from "../room/state.js";

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
