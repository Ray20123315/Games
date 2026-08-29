import { REPLAY_PUBLIC_MS, ROOM_CODE_RE } from "../core/config.js";
import { audit, first, run } from "../core/db.js";
import { HttpError } from "../core/http.js";

const BULK_LIMIT = 20;

const cleanReason = (v) => {
  const s = String(v || "").trim().slice(0, 1000);
  if (!s) throw new HttpError(400, "reason_required", "此管理操作必須填寫原因。");
  return s;
};

function uniqueList(value, fieldName) {
  const raw = Array.isArray(value) ? value : [];
  const items = [...new Set(raw.map((v) => String(v || "").trim()).filter(Boolean))];
  if (!items.length) throw new HttpError(400, `${fieldName}_required`, "請至少選擇一筆資料。");
  if (items.length > BULK_LIMIT) throw new HttpError(400, `${fieldName}_too_many`, `一次最多處理 ${BULK_LIMIT} 筆。`);
  return items;
}

export function isContextAdminApi(path) {
  return path === "/admin/api/rooms/bulk-action" || path === "/admin/api/replays/bulk-action";
}

async function roomAction(env, roomId, action, reason, actor, db) {
  const code = String(roomId || "").toUpperCase();
  if (!ROOM_CODE_RE.test(code)) throw new HttpError(400, "room_invalid", `房號 ${code || "(空白)"} 格式錯誤。`);
  if (!env?.ROOMS) throw new HttpError(503, "rooms_unavailable", "ROOMS Durable Object binding 不可用。");
  const endpoint = action === "close" ? "/admin/close-room" : "/admin/terminate-game";
  const response = await env.ROOMS.getByName(code).fetch(new Request(`https://boardverse.internal${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  }));
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new HttpError(response.status, "room_action_failed", data.message || "房間操作失敗。");
  }
  await audit(db, action === "close" ? "room.close" : "room.terminate_game", {
    adminActor: actor,
    targetType: "room",
    targetId: code,
    reason,
  });
  return { id: code, ok: true };
}

async function replayAction(db, replayId, action, reason, actor, now) {
  const id = String(replayId || "").trim();
  const row = await first(db, "SELECT id,room_id,game_type,public_until,delete_after FROM replays WHERE id=? LIMIT 1", id);
  if (!row) throw new HttpError(404, "replay_not_found", "找不到回放。");

  if (action === "delete") {
    await run(db, "DELETE FROM replay_events WHERE replay_id=?", id);
    await run(db, "DELETE FROM replays WHERE id=?", id);
    await audit(db, "replay.delete", {
      adminActor: actor,
      targetType: "replay",
      targetId: id,
      reason,
      before: { roomId: row.room_id, gameType: row.game_type, publicUntil: row.public_until, deleteAfter: row.delete_after },
      after: { deleted: true },
    });
    return { id, roomId: row.room_id, action, ok: true };
  }

  if (action === "unpublish") {
    const publicUntil = now - 1;
    await run(db, "UPDATE replays SET public_until=? WHERE id=?", publicUntil, id);
    await audit(db, "replay.unpublish", {
      adminActor: actor,
      targetType: "replay",
      targetId: id,
      reason,
      before: { publicUntil: row.public_until, deleteAfter: row.delete_after },
      after: { publicUntil, deleteAfter: row.delete_after },
    });
    return { id, roomId: row.room_id, action, ok: true, publicUntil, deleteAfter: Number(row.delete_after) };
  }

  if (action === "publish") {
    const publicUntil = now + REPLAY_PUBLIC_MS;
    const deleteAfter = Math.max(Number(row.delete_after) || 0, publicUntil + 1);
    await run(db, "UPDATE replays SET public_until=?,delete_after=? WHERE id=?", publicUntil, deleteAfter, id);
    await audit(db, "replay.publish", {
      adminActor: actor,
      targetType: "replay",
      targetId: id,
      reason,
      before: { publicUntil: row.public_until, deleteAfter: row.delete_after },
      after: { publicUntil, deleteAfter },
    });
    return { id, roomId: row.room_id, action, ok: true, publicUntil, deleteAfter };
  }

  throw new HttpError(400, "replay_action_invalid", "未知的回放操作。");
}

export async function contextAdminApi({ db, env, request, path, actor }) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "只接受 POST。" );
  const body = await request.json();
  const reason = cleanReason(body.reason);

  if (path === "/admin/api/rooms/bulk-action") {
    const roomIds = uniqueList(body.roomIds, "rooms");
    const action = body.action === "close" ? "close" : body.action === "terminate" ? "terminate" : "";
    if (!action) throw new HttpError(400, "room_action_invalid", "未知的房間操作。");
    const results = [];
    for (const roomId of roomIds) {
      try {
        results.push(await roomAction(env, roomId, action, reason, actor, db));
      } catch (error) {
        results.push({ id: roomId, ok: false, message: String(error?.message || error) });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { action, total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  if (path === "/admin/api/replays/bulk-action") {
    const replayIds = uniqueList(body.replayIds, "replays");
    const action = ["unpublish", "publish", "delete"].includes(body.action) ? body.action : "";
    if (!action) throw new HttpError(400, "replay_action_invalid", "未知的回放操作。");
    const now = Date.now();
    const results = [];
    for (const replayId of replayIds) {
      try {
        results.push(await replayAction(db, replayId, action, reason, actor, now));
      } catch (error) {
        results.push({ id: replayId, ok: false, message: String(error?.message || error) });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { action, total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  throw new HttpError(404, "not_found", "Context Admin API route not found.");
}
