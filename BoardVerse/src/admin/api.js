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
const cleanReason = (v) => { const s=String(v||"").trim().slice(0,1000); if(!s) throw new HttpError(400,"reason_required","此管理操作必須填寫原因。"); return s; };

export async function adminApi({ db, env, request, path, url, actor }) {
  if (path === "/admin/api/summary" && request.method === "GET") {
    const [users,rooms,replays,reports,flags] = await Promise.all([
      first(db,"SELECT COUNT(*) n FROM users"), first(db,"SELECT COUNT(*) n FROM active_rooms WHERE status!='closed'"),
      first(db,"SELECT COUNT(*) n FROM replays"), first(db,"SELECT COUNT(*) n FROM reports WHERE status IN ('pending','in_progress')"),
      first(db,"SELECT COUNT(*) n FROM risk_flags WHERE status IN ('open','pending')")
    ]);
    return { users:Number(users?.n||0), rooms:Number(rooms?.n||0), replays:Number(replays?.n||0), reports:Number(reports?.n||0), riskFlags:Number(flags?.n||0) };
  }
  if (path === "/admin/api/users" && request.method === "GET") {
    const q=String(url.searchParams.get("q")||"").trim().toLocaleLowerCase("en-US");
    const like=`%${q.replace(/[%_]/g,"\\$&")}%`;
    return q ? all(db,`SELECT id,username_display,email_normalized,email_verified_at,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until,created_at FROM users WHERE username_normalized LIKE ? ESCAPE '\\' OR email_normalized LIKE ? ESCAPE '\\' OR id=? ORDER BY created_at DESC LIMIT ?`,like,like,q,LIMIT)
      : all(db,`SELECT id,username_display,email_normalized,email_verified_at,status,suspended_until,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until,created_at FROM users ORDER BY created_at DESC LIMIT ?`,LIMIT);
  }
  if (path === "/admin/api/user/detail" && request.method === "GET") {
    const id=url.searchParams.get("id"); if(!id) throw new HttpError(400,"id_required","缺少 user id。");
    const user=await first(db,"SELECT * FROM users WHERE id=?",id); if(!user) throw new HttpError(404,"not_found","找不到使用者。");
    const [sessions,flags,actions,gpEvents]=await Promise.all([
      all(db,"SELECT id,created_at,expires_at,last_seen_at,revoked_at FROM user_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50",id),
      all(db,"SELECT * FROM risk_flags WHERE user_id=? ORDER BY created_at DESC LIMIT 100",id),
      all(db,"SELECT * FROM disciplinary_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 100",id),
      all(db,"SELECT * FROM gp_events WHERE user_id=? ORDER BY created_at DESC LIMIT 100",id)
    ]); return {user,sessions,flags,actions,gpEvents};
  }
  if (path === "/admin/api/user/discipline" && request.method === "POST") {
    const b=await request.json(); return applyDiscipline(db,String(b.userId||""),String(b.action||""),{reason:cleanReason(b.reason),value:b.value,adminActor:actor});
  }
  if (path === "/admin/api/user/confirmed-cheating" && request.method === "POST") {
    const b=await request.json(); return confirmCheatingDefault(db,String(b.userId||""),{reason:cleanReason(b.reason),suspendedUntil:Number(b.suspendedUntil),adminActor:actor});
  }
  if (path === "/admin/api/user/activation" && request.method === "POST") {
    const b=await request.json(); const result=await createAdminActivation(db,{username:b.username,email:b.email});
    await audit(db,"user.activation_created",{adminActor:actor,targetType:"user",targetId:result.userId,reason:"admin activation"}); return result;
  }
  if (path === "/admin/api/rooms" && request.method === "GET") return all(db,"SELECT * FROM active_rooms ORDER BY last_activity_at DESC LIMIT ?",LIMIT);
  if (path === "/admin/api/room/terminate-game" && request.method === "POST") {
    const b=await request.json(), roomId=String(b.roomId||"").toUpperCase(), reason=cleanReason(b.reason); if(!ROOM_CODE_RE.test(roomId)) throw new HttpError(400,"room_invalid","房號格式錯誤。");
    const res=await env.ROOMS.getByName(roomId).fetch(new Request("https://boardverse.internal/admin/terminate-game",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})}));
    if(!res.ok) throw new HttpError(res.status,"room_action_failed",(await res.json().catch(()=>({}))).message||"操作失敗。"); await audit(db,"room.terminate_game",{adminActor:actor,targetType:"room",targetId:roomId,reason}); return {ok:true};
  }
  if (path === "/admin/api/room/close" && request.method === "POST") {
    const b=await request.json(), roomId=String(b.roomId||"").toUpperCase(), reason=cleanReason(b.reason); if(!ROOM_CODE_RE.test(roomId)) throw new HttpError(400,"room_invalid","房號格式錯誤。");
    const res=await env.ROOMS.getByName(roomId).fetch(new Request("https://boardverse.internal/admin/close-room",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})}));
    if(!res.ok) throw new HttpError(res.status,"room_action_failed",(await res.json().catch(()=>({}))).message||"操作失敗。"); await audit(db,"room.close",{adminActor:actor,targetType:"room",targetId:roomId,reason}); return {ok:true};
  }
  if (path === "/admin/api/replays" && request.method === "GET") return listAdminReplays(db,{gameType:url.searchParams.get("gameType"),limit:Number(url.searchParams.get("limit"))||50,offset:Number(url.searchParams.get("offset"))||0});
  if (path === "/admin/api/replay" && request.method === "GET") { const r=await replayById(db,url.searchParams.get("id")); if(!r) throw new HttpError(404,"not_found","找不到 Replay。"); return hydrateReplay(db,r); }
  if (path === "/admin/api/reports" && request.method === "GET") return listReports(db,{status:url.searchParams.get("status"),type:url.searchParams.get("type"),limit:50,offset:Number(url.searchParams.get("offset"))||0});
  if (path === "/admin/api/report" && request.method === "POST") { const b=await request.json(); await updateReport(db,b.id,b.status,b.note); await audit(db,"report.status",{adminActor:actor,targetType:"report",targetId:b.id,reason:String(b.note||b.status)}); return {ok:true}; }
  if (path === "/admin/api/risk" && request.method === "GET") return listRiskFlags(db,{status:url.searchParams.get("status"),limit:50,offset:Number(url.searchParams.get("offset"))||0});
  if (path === "/admin/api/risk/review" && request.method === "POST") { const b=await request.json(); await reviewRiskFlag(db,b.id,b.status); await audit(db,"risk.review",{adminActor:actor,targetType:"risk_flag",targetId:b.id,reason:b.status}); return {ok:true}; }
  if (path === "/admin/api/global-chat" && request.method === "GET") {
    const settings={enabled:await first(db,"SELECT value_json FROM system_settings WHERE key='global_chat_enabled'"),slowMs:await first(db,"SELECT value_json FROM system_settings WHERE key='global_chat_slow_ms'")};
    let state={messages:[],connections:0}; if(env.GLOBAL_CHAT){const r=await env.GLOBAL_CHAT.getByName("global").fetch("https://boardverse.internal/admin/state"); state=await r.json();}
    return {enabled:settings.enabled?JSON.parse(settings.enabled.value_json):true,slowMs:settings.slowMs?JSON.parse(settings.slowMs.value_json):5000,...state};
  }
  if (path === "/admin/api/global-chat/delete" && request.method === "POST") { const b=await request.json(); if(!env.GLOBAL_CHAT)throw new HttpError(503,"global_chat_unavailable","GLOBAL_CHAT 尚未綁定。"); await env.GLOBAL_CHAT.getByName("global").fetch(new Request("https://boardverse.internal/admin/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:b.id})})); await audit(db,"global_chat.delete",{adminActor:actor,targetType:"chat_message",targetId:b.id,reason:cleanReason(b.reason)}); return {ok:true}; }
  if (path === "/admin/api/global-chat/mute" && request.method === "POST") { const b=await request.json(),subjectType=b.subjectType==="user"?"user":"guest",subjectId=String(b.subjectId||""),until=Number(b.mutedUntil),reason=cleanReason(b.reason); if(!subjectId||!Number.isFinite(until)||until<=Date.now())throw new HttpError(400,"mute_invalid","Mute 參數不合法。"); await run(db,`INSERT INTO chat_mutes(subject_type,subject_id,channel,muted_until,reason,created_at) VALUES(?,?,'global',?,?,?) ON CONFLICT(subject_type,subject_id,channel) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason`,subjectType,subjectId,until,reason,Date.now()); await audit(db,"global_chat.mute",{adminActor:actor,targetType:subjectType,targetId:subjectId,reason,after:{mutedUntil:until}}); return {ok:true}; }
  if (path === "/admin/api/announcements" && request.method === "GET") return all(db,"SELECT * FROM announcements ORDER BY published_at DESC LIMIT 100");
  if (path === "/admin/api/announcement" && request.method === "POST") { const b=await request.json(); const id=await saveAnnouncement(db,b,b.id||null); await audit(db,"announcement.save",{adminActor:actor,targetType:"announcement",targetId:id,reason:"admin edit"}); return {ok:true,id}; }
  if (path === "/admin/api/settings" && request.method === "POST") { const b=await request.json(); const allowed=new Set(["global_chat_slow_ms","global_chat_enabled","maintenance_mode"]); if(!allowed.has(b.key)) throw new HttpError(400,"setting_invalid","不可修改此設定。"); await setSetting(db,b.key,b.value); await audit(db,"setting.update",{adminActor:actor,targetType:"setting",targetId:b.key,reason:cleanReason(b.reason)}); return {ok:true}; }
  if (path === "/admin/api/audit" && request.method === "GET") return all(db,"SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",LIMIT,Math.max(0,Number(url.searchParams.get("offset"))||0));
  throw new HttpError(404,"not_found","Admin API route not found.");
}
