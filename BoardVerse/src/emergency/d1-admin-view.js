import { ensureDbSchema } from "../core/db.js";
import { json } from "../core/http.js";
import { requireAdmin } from "../admin/auth.js";
import { ensureEmergencySchema } from "./d1-mode.js";

const LIMIT = 50;

async function count(db, sql, ...binds) {
  const statement = db.prepare(sql);
  const row = binds.length ? await statement.bind(...binds).first() : await statement.first();
  return Number(row?.n || 0);
}

function safeRoom(raw) {
  try { return raw ? JSON.parse(String(raw)) : {}; }
  catch { return {}; }
}

function roomPlayers(room) {
  const members = Array.isArray(room?.members) ? room.members : [];
  const seats = new Set(Array.isArray(room?.seats) ? room.seats.filter(Boolean).map(String) : []);
  return members
    .filter((member) => seats.has(String(member?.id || "")))
    .map((member) => ({
      id: member?.id || null,
      userId: member?.userId || room?.bv?.memberUsers?.[member?.id] || null,
      name: String(member?.name || "玩家"),
      side: member?.side || null,
      connected: member?.connected !== false,
    }));
}

function emergencyAdminRow(row) {
  const room = safeRoom(row?.room_json);
  const members = Array.isArray(room?.members) ? room.members : [];
  const seats = new Set(Array.isArray(room?.seats) ? room.seats.filter(Boolean).map(String) : []);
  const owner = members.find((member) => String(member?.id || "") === String(room?.ownerId || "")) || null;
  const variant = room?.rules?.variant || room?.rules?.ruleset || room?.rules?.opening || null;
  return {
    room_id: String(row?.room_id || room?.id || ""),
    room_name: String(row?.room_name || room?.name || "BoardVerse"),
    game_type: String(row?.game_id || room?.gameId || ""),
    variant,
    private_room: !!Number(row?.private_room || 0),
    voice_enabled: !!room?.bv?.voiceEnabled,
    owner_user_id: owner?.userId || room?.bv?.memberUsers?.[owner?.id] || null,
    players_json: JSON.stringify(roomPlayers(room)),
    spectator_count: members.filter((member) => !seats.has(String(member?.id || "")) && member?.role === "spectator").length,
    status: String(row?.status || room?.status || "waiting"),
    live_status: String(row?.status || room?.status || "waiting"),
    admin_paused: false,
    admin_paused_at: null,
    created_at: Number(row?.created_at || room?.createdAt || 0),
    last_activity_at: Number(row?.updated_at || room?.updatedAt || 0),
    started_at: row?.started_at == null ? null : Number(row.started_at),
    ended_at: row?.ended_at == null ? null : Number(row.ended_at),
    emergency_mode: true,
  };
}

async function emergencySummary(db) {
  const now = Date.now();
  const [users, rooms, replays, reports, riskFlags] = await Promise.all([
    count(db, "SELECT COUNT(*) n FROM users"),
    count(db, "SELECT COUNT(*) n FROM emergency_rooms WHERE expires_at>? AND status!='closed'", now),
    count(db, "SELECT COUNT(*) n FROM replays"),
    count(db, "SELECT COUNT(*) n FROM reports WHERE status IN ('pending','in_progress')"),
    count(db, "SELECT COUNT(*) n FROM risk_flags WHERE status IN ('open','pending')"),
  ]);
  return { users, rooms, replays, reports, riskFlags, emergency: true };
}

async function emergencyRooms(db) {
  const result = await db.prepare(`SELECT room_id,room_json,room_name,game_id,status,private_room,created_at,updated_at,started_at,ended_at
    FROM emergency_rooms WHERE expires_at>? AND status!='closed' ORDER BY updated_at DESC LIMIT ?`)
    .bind(Date.now(), LIMIT).all();
  return (result?.results || []).map(emergencyAdminRow);
}

export async function emergencyAdminRead(request, env) {
  const url = new URL(request.url);
  if (request.method !== "GET") return null;
  if (url.pathname !== "/admin/api/summary" && url.pathname !== "/admin/api/rooms") return null;
  const db = env?.BOARDVERSE_D1;
  if (!db) return null;
  try {
    await requireAdmin(env, request);
    await ensureDbSchema(db);
    await ensureEmergencySchema(db);
    const data = url.pathname === "/admin/api/summary" ? await emergencySummary(db) : await emergencyRooms(db);
    return json({ ok: true, data }, 200, { "x-boardverse-admin-data": "emergency-d1" });
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({
      ok: false,
      error: error?.code || "emergency_admin_read_failed",
      message: status === 401 ? "請先登入管理後台。" : "緊急 D1 模式的管理資料暫時讀取失敗。",
    }, status);
  }
}
