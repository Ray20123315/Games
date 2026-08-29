import { ROOM_CODE_RE } from "../core/config.js";
import { all, audit, first, run, setSetting } from "../core/db.js";
import { HttpError } from "../core/http.js";
import { saveAnnouncement } from "../announcements/announcements.js";
import { listAdminReplays, replayById, hydrateReplay } from "../replay/archive.js";
import { listReports, updateReport } from "../reports/reports.js";
import { listRiskFlags, reviewRiskFlag } from "../risk/risk.js";
import { applyDiscipline, confirmCheatingDefault } from "../risk/discipline.js";
import { createAdminActivation } from "../auth/users.js";

const LIMIT = 50;
const MAX_BULK_USERS = 20;

const cleanReason = (v) => {
  const s = String(v || "").trim().slice(0, 1000);
  if (!s) throw new HttpError(400, "reason_required", "此管理操作必須填寫原因。");
  return s;
};
const nameKey = (v) => String(v || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");

async function resolveUserByName(db, value) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw) throw new HttpError(400, "username_required", "請輸入使用者名稱。");
  const key = nameKey(raw);
  const user = await first(db, "SELECT id,username_display FROM users WHERE username_normalized=? OR id=? LIMIT 1", key, raw);
  if (!user) throw new HttpError(404, "user_not_found", `找不到使用者「${raw}」。`);
  return user;
}

async function resolveChatSubject(db, env, body) {
  const subjectType = body.subjectType === "user" ? "user" : "guest";
  const directId = String(body.subjectId || "").trim();
  const visibleName = String(body.subjectName || body.name || "").normalize("NFKC").trim();
  if (directId) return { subjectType, subjectId: directId, subjectName: visibleName || directId };
  if (!visibleName) throw new HttpError(400, "subject_name_required", "請指定使用者／訪客名稱。");
  if (subjectType === "user") {
    const user = await resolveUserByName(db, visibleName);
    return { subjectType, subjectId: user.id, subjectName: user.username_display };
  }
  if (!env.GLOBAL_CHAT) throw new HttpError(503, "global_chat_unavailable", "GLOBAL_CHAT 尚未綁定。");
  const response = await env.GLOBAL_CHAT.getByName("global").fetch("https://boardverse.internal/admin/state");
  const state = await response.json().catch(() => ({ messages: [] }));
  const key = nameKey(visibleName);
  const matches = (Array.isArray(state.messages) ? state.messages : []).filter((m) => m?.senderKind === "guest" && nameKey(m?.name) === key);
  const ids = [...new Set(matches.map((m) => String(m.senderId || "")).filter(Boolean))];
  if (!ids.length) throw new HttpError(404, "guest_not_found", `找不到近期訪客「${visibleName}」。`);
  if (ids.length > 1) throw new HttpError(409, "guest_name_ambiguous", "有多個同名訪客，請直接從聊天室訊息列點選管理。");
  return { subjectType, subjectId: ids[0], subjectName: visibleName };
}

function cleanBulkNames(body) {
  const source = Array.isArray(body.usernames) ? body.usernames : [body.username || body.user || body.userId];
  const out = [];
  const seen = new Set();
  for (const value of source) {
    const raw = String(value || "").normalize("NFKC").trim();
    const key = nameKey(raw);
    if (!raw || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  if (!out.length) throw new HttpError(400, "users_required", "請至少選擇一位使用者。");
  if (out.length > MAX_BULK_USERS) throw new HttpError(400, "too_many_users", `單次最多可操作 ${MAX_BULK_USERS} 位使用者。`);
  return out;
}

function disciplineValue(body, action) {
  if (action === "suspend") {
    const days = Math.max(1, Math.min(3650, Math.trunc(Number(body.days ?? body.value) || 1)));
    return Date.now() + days * 86_400_000;
  }
  return body.value;
}

const ROOM_ACTIONS = Object.freeze({
  pause: { path: "/admin/pause-room", audit: "room.pause" },
  resume: { path: "/admin/resume-room", audit: "room.resume" },
  terminate: { path: "/admin/terminate-game", audit: "room.terminate_game" },
  close: { path: "/admin/close-room", audit: "room.close" },
});
function roomIdValue(value) {
  const roomId=String(value||"").trim().toUpperCase();
  if(!ROOM_CODE_RE.test(roomId)) throw new HttpError(400,"room_invalid","房號格式錯誤："+(roomId||"(空白)"));
  return roomId;
}
async function invokeRoomAction(env, roomId, action, reason) {
  const spec=ROOM_ACTIONS[action];
  if(!spec) throw new HttpError(400,"room_action_invalid","不支援的房間操作。");
  if(!env?.ROOMS) throw new HttpError(503,"rooms_unavailable","ROOMS Durable Object 尚未綁定。");
  const res=await env.ROOMS.getByName(roomId).fetch(new Request("https://boardverse.internal"+spec.path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})}));
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new HttpError(res.status,"room_action_failed",data.message||"房間操作失敗。");
  return data;
}
async function auditedRoomAction(db, env, actor, roomId, action, reason) {
  const data=await invokeRoomAction(env,roomId,action,reason);
  await audit(db,ROOM_ACTIONS[action].audit,{adminActor:actor,targetType:"room",targetId:roomId,reason,after:{action,...data}});
  return {roomId,ok:true,...data};
}
async function roomLiveState(env,row) {
  if(!env?.ROOMS || row.status==="closed") return {...row,admin_paused:false,admin_paused_at:null};
  try {
    const res=await env.ROOMS.getByName(row.room_id).fetch("https://boardverse.internal/admin/state");
    if(!res.ok) return {...row,admin_paused:false,admin_paused_at:null};
    const state=await res.json();
    return {...row,admin_paused:!!state.paused,admin_paused_at:state.pausedAt||null,live_status:state.status||row.status,live_closed:!!state.closed};
  } catch { return {...row,admin_paused:false,admin_paused_at:null}; }
}

export async function adminApi({ db, env, request, path, url, actor }) {
  if (path === "/admin/api/summary" && request.method === "GET") {
    const [users, rooms, replays, reports, flags] = await Promise.all([
      first(db, "SELECT COUNT(*) n FROM users"),
      first(db, "SELECT COUNT(*) n FROM active_rooms WHERE status!='closed'"),
      first(db, "SELECT COUNT(*) n FROM replays"),
      first(db, "SELECT COUNT(*) n FROM reports WHERE status IN ('pending','in_progress')"),
      first(db, "SELECT COUNT(*) n FROM risk_flags WHERE status IN ('open','pending')"),
    ]);
    return { users: Number(users?.n || 0), rooms: Number(rooms?.n || 0), replays: Number(replays?.n || 0), reports: Number(reports?.n || 0), riskFlags: Number(flags?.n || 0) };
  }

  if (path === "/admin/api/users" && request.method === "GET") {
    const q = nameKey(url.searchParams.get("q") || "");
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const sql = `SELECT id,username_display,email_normalized,status,suspended_until,gp,level,reputation,created_at
      FROM users ${q ? "WHERE username_normalized LIKE ? ESCAPE '\\' OR email_normalized LIKE ? ESCAPE '\\'" : ""}
      ORDER BY created_at DESC LIMIT ?`;
    return q ? all(db, sql, like, like, LIMIT) : all(db, sql, LIMIT);
  }

  if (path === "/admin/api/user/detail" && request.method === "GET") {
    const user = await resolveUserByName(db, url.searchParams.get("username") || url.searchParams.get("id"));
    const row = await first(db, "SELECT id,username_display,email_normalized,status,suspended_until,gp,level,reputation,created_at FROM users WHERE id=?", user.id);
    const [flags, actions, gpEvents] = await Promise.all([
      all(db, "SELECT type,status,created_at,reviewed_at FROM risk_flags WHERE user_id=? ORDER BY created_at DESC LIMIT 30", user.id),
      all(db, "SELECT action_type,reason,starts_at,ends_at,created_at FROM disciplinary_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 30", user.id),
      all(db, "SELECT amount,reason,created_at FROM gp_events WHERE user_id=? ORDER BY created_at DESC LIMIT 30", user.id),
    ]);
    return { user: row, flags, actions, gpEvents };
  }

  if (path === "/admin/api/users/bulk-discipline" && request.method === "POST") {
    const b = await request.json();
    const usernames = cleanBulkNames(b);
    const action = String(b.action || "");
    const reason = cleanReason(b.reason);
    const results = [];
    for (const requestedName of usernames) {
      try {
        const user = await resolveUserByName(db, requestedName);
        if (action === "confirmed_cheating") {
          const days = Math.max(1, Math.min(3650, Math.trunc(Number(b.days ?? b.value) || 7)));
          await confirmCheatingDefault(db, user.id, {
            reason,
            suspendedUntil: Date.now() + days * 86_400_000,
            adminActor: actor,
          });
        } else {
          await applyDiscipline(db, user.id, action, {
            reason,
            value: disciplineValue(b, action),
            adminActor: actor,
          });
        }
        results.push({ username: user.username_display, ok: true });
      } catch (error) {
        results.push({ username: requestedName, ok: false, message: String(error?.message || error) });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  if (path === "/admin/api/user/discipline" && request.method === "POST") {
    const b = await request.json();
    const user = await resolveUserByName(db, b.username || b.user || b.userId);
    return applyDiscipline(db, user.id, String(b.action || ""), { reason: cleanReason(b.reason), value: b.value, adminActor: actor });
  }

  if (path === "/admin/api/user/confirmed-cheating" && request.method === "POST") {
    const b = await request.json();
    const user = await resolveUserByName(db, b.username || b.user || b.userId);
    return confirmCheatingDefault(db, user.id, { reason: cleanReason(b.reason), suspendedUntil: Number(b.suspendedUntil), adminActor: actor });
  }

  if (path === "/admin/api/user/activation" && request.method === "POST") {
    const b = await request.json();
    const result = await createAdminActivation(db, { username: b.username, email: b.email });
    await audit(db, "user.activation_created", { adminActor: actor, targetType: "user", targetId: result.userId, reason: "admin activation" });
    return result;
  }

  if (path === "/admin/api/rooms" && request.method === "GET") {
    const rows=await all(db,"SELECT * FROM active_rooms ORDER BY last_activity_at DESC LIMIT ?",LIMIT);
    return Promise.all(rows.map((row)=>roomLiveState(env,row)));
  }
  if (path === "/admin/api/rooms/batch" && request.method === "POST") {
    const b=await request.json(), action=String(b.action||"");
    if(!ROOM_ACTIONS[action]) throw new HttpError(400,"room_action_invalid","批量房間操作不合法。");
    const reason=cleanReason(b.reason), raw=Array.isArray(b.roomIds)?b.roomIds:[];
    const roomIds=[...new Set(raw.map((id)=>roomIdValue(id)))];
    if(!roomIds.length) throw new HttpError(400,"room_ids_required","請至少選擇一個房間。");
    if(roomIds.length>LIMIT) throw new HttpError(400,"room_ids_limit","一次最多操作 "+LIMIT+" 個房間。");
    const results=await Promise.all(roomIds.map(async(roomId)=>{try{return await auditedRoomAction(db,env,actor,roomId,action,reason)}catch(error){return{roomId,ok:false,code:error?.code||"room_action_failed",message:error?.message||"操作失敗。"}}}));
    return {ok:results.every((x)=>x.ok),action,requested:roomIds.length,succeeded:results.filter((x)=>x.ok).length,failed:results.filter((x)=>!x.ok).length,results};
  }
  if (path === "/admin/api/room/pause" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"pause",cleanReason(b.reason));
  }
  if (path === "/admin/api/room/resume" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"resume",cleanReason(b.reason));
  }

  if (path === "/admin/api/room/terminate-game" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"terminate",cleanReason(b.reason));
  }

  if (path === "/admin/api/room/close" && request.method === "POST") {
    const b=await request.json(); return auditedRoomAction(db,env,actor,roomIdValue(b.roomId),"close",cleanReason(b.reason));
  }

  if (path === "/admin/api/replays" && request.method === "GET") {
    return listAdminReplays(db, { gameType: url.searchParams.get("gameType"), limit: Number(url.searchParams.get("limit")) || 20, offset: Number(url.searchParams.get("offset")) || 0 });
  }
  if (path === "/admin/api/replay" && request.method === "GET") {
    const r = await replayById(db, url.searchParams.get("id"));
    if (!r) throw new HttpError(404, "not_found", "找不到回放。");
    return hydrateReplay(db, r);
  }

  if (path === "/admin/api/reports" && request.method === "GET") return listReports(db, { status: url.searchParams.get("status"), type: url.searchParams.get("type"), limit: 20, offset: Number(url.searchParams.get("offset")) || 0 });
  if (path === "/admin/api/report" && request.method === "POST") {
    const b = await request.json();
    await updateReport(db, b.id, b.status, b.note);
    await audit(db, "report.status", { adminActor: actor, targetType: "report", targetId: b.id, reason: String(b.note || b.status) });
    return { ok: true };
  }

  if (path === "/admin/api/risk" && request.method === "GET") return listRiskFlags(db, { status: url.searchParams.get("status"), limit: 20, offset: Number(url.searchParams.get("offset")) || 0 });
  if (path === "/admin/api/risk/review" && request.method === "POST") {
    const b = await request.json();
    await reviewRiskFlag(db, b.id, b.status);
    await audit(db, "risk.review", { adminActor: actor, targetType: "risk_flag", targetId: b.id, reason: b.status });
    return { ok: true };
  }

  if (path === "/admin/api/global-chat" && request.method === "GET") {
    const settings = {
      enabled: await first(db, "SELECT value_json FROM system_settings WHERE key='global_chat_enabled'"),
      slowMs: await first(db, "SELECT value_json FROM system_settings WHERE key='global_chat_slow_ms'"),
    };
    let state = { messages: [], connections: 0 };
    if (env.GLOBAL_CHAT) {
      const r = await env.GLOBAL_CHAT.getByName("global").fetch("https://boardverse.internal/admin/state");
      state = await r.json();
    }
    return { enabled: settings.enabled ? JSON.parse(settings.enabled.value_json) : true, slowMs: settings.slowMs ? JSON.parse(settings.slowMs.value_json) : 5000, ...state };
  }

  if (path === "/admin/api/global-chat/delete" && request.method === "POST") {
    const b = await request.json();
    if (!env.GLOBAL_CHAT) throw new HttpError(503, "global_chat_unavailable", "GLOBAL_CHAT 尚未綁定。");
    await env.GLOBAL_CHAT.getByName("global").fetch(new Request("https://boardverse.internal/admin/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.id }) }));
    await audit(db, "global_chat.delete", { adminActor: actor, targetType: "chat_message", targetId: b.id, reason: cleanReason(b.reason) });
    return { ok: true };
  }

  if (path === "/admin/api/global-chat/mute" && request.method === "POST") {
    const b = await request.json();
    const { subjectType, subjectId, subjectName } = await resolveChatSubject(db, env, b);
    const until = Number(b.mutedUntil), reason = cleanReason(b.reason);
    if (!Number.isFinite(until) || until <= Date.now()) throw new HttpError(400, "mute_invalid", "禁言截止時間不合法。");
    await run(db, `INSERT INTO chat_mutes(subject_type,subject_id,channel,muted_until,reason,created_at) VALUES(?,?,'global',?,?,?)
      ON CONFLICT(subject_type,subject_id,channel) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason`, subjectType, subjectId, until, reason, Date.now());
    await audit(db, "global_chat.mute", { adminActor: actor, targetType: subjectType, targetId: subjectId, reason, after: { mutedUntil: until, name: subjectName } });
    return { ok: true, name: subjectName };
  }

  if (path === "/admin/api/announcements" && request.method === "GET") return all(db, "SELECT id,title,content,type,enabled,published_at,expires_at FROM announcements ORDER BY published_at DESC LIMIT 20");
  if (path === "/admin/api/announcement" && request.method === "POST") {
    const b = await request.json();
    const id = await saveAnnouncement(db, b, b.id || null);
    await audit(db, "announcement.save", { adminActor: actor, targetType: "announcement", targetId: id, reason: "admin edit" });
    return { ok: true, id };
  }

  if (path === "/admin/api/settings" && request.method === "POST") {
    const b = await request.json();
    const allowed = new Set(["global_chat_slow_ms", "global_chat_enabled", "maintenance_mode"]);
    if (!allowed.has(b.key)) throw new HttpError(400, "setting_invalid", "不可修改此設定。");
    await setSetting(db, b.key, b.value);
    await audit(db, "setting.update", { adminActor: actor, targetType: "setting", targetId: b.key, reason: cleanReason(b.reason) });
    return { ok: true };
  }

  if (path === "/admin/api/audit" && request.method === "GET") {
    return all(db, "SELECT admin_actor,action_type,target_type,target_id,reason,created_at FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?", LIMIT, Math.max(0, Number(url.searchParams.get("offset")) || 0));
  }

  throw new HttpError(404, "not_found", "Admin API route not found.");
}
