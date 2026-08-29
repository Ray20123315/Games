import compatApp from "./legacy/runtime-v029.js";
import { ADMIN_COOKIE, APP_VERSION, GAME_IDS, GUEST_COOKIE, ROOM_CODE_RE, USER_COOKIE } from "./core/config.js";
import { ensureDbSchema, requireDb, setting, run } from "./core/db.js";
import { clearCookie, cookie, html, json, parseCookies, redirect, toErrorResponse, HttpError, clientIp } from "./core/http.js";
import { randomToken, signPayload, sha256Hex } from "./core/crypto.js";
import { activeAnnouncements } from "./announcements/announcements.js";
import { normalizeClockConfig } from "./clock/clock-engine.js";
import { revokeCurrentSession, sessionUser } from "./auth/sessions.js";
import { activateAdminUser, loginUser, registerUser, requestPasswordReset, resendVerification, resetPassword, verifyEmailToken } from "./auth/users.js";
import { checkIn, canCreateCustomRoom, consumeCustomRoom, deletePreset, getUserMembership, listPresets, noteActivity, savePreset } from "./membership/membership.js";
import { publicReplayByToken, replayById, cleanupReplayArchive } from "./replay/archive.js";
import { offlineReplayResponse, replayResponse } from "./replay/replay-page.js";
import { createReport } from "./reports/reports.js";
import { adminLogin, adminPlayerEntitlement, adminUserLogin, issueAdminPlayerEntitlement, requireAdmin } from "./admin/auth.js";
import { adminApi } from "./admin/api.js";
import { adminDashboardPage, adminLoginPage } from "./admin/pages.js";
import { accountPage, activatePage, authPage, forgotPage, reportPage, resetPage } from "./ui/pages.js";
import { enhanceLegacyHtml } from "./ui/enhance.js";
import { GameRoom } from "./room/GameRoom.js";
import { GlobalChat } from "./chat/GlobalChat.js";

export { GameRoom, GlobalChat };

const LOBBY_NAME = "__BOARDVERSE_LOBBY__";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function baseUrl(request) { const u = new URL(request.url); return `${u.protocol}//${u.host}`; }
function formObject(fd) { return Object.fromEntries([...fd.entries()].map(([k,v])=>[k,String(v)])); }
function roomStub(env, roomId) { if (!env?.ROOMS) throw new HttpError(503,"missing_binding","缺少 ROOMS → GameRoom Durable Object binding。"); return env.ROOMS.getByName(roomId); }
function randomRoomCode() { const bytes=crypto.getRandomValues(new Uint8Array(6)); let out=""; for(const b of bytes) out+=ALPHABET[b%ALPHABET.length]; return out; }
async function currentUserMaybe(env, request) { if(!env?.BOARDVERSE_DB) return null; try { return await sessionUser(env.BOARDVERSE_DB,request); } catch { return null; } }
async function bodyInput(request) { const ct=request.headers.get("content-type")||""; if(ct.includes("application/json")) return request.json(); if(ct.includes("application/x-www-form-urlencoded")||ct.includes("multipart/form-data")) return formObject(await request.formData()); return {}; }
async function guardedLogin(db, env, request, identifier, password) {
  const key=await sha256Hex(`${clientIp(request)}|${String(identifier||"").normalize("NFKC").trim().toLocaleLowerCase("en-US")}`), now=Date.now(), floor=now-15*60_000;
  const row=await db.prepare("SELECT window_start,failure_count,blocked_until FROM user_login_attempts WHERE login_key=?").bind(key).first();
  if(Number(row?.blocked_until||0)>now) throw new HttpError(429,"login_locked","登入嘗試過多，請稍後再試。");
  try { const out=await loginUser(db,identifier,password); await run(db,"DELETE FROM user_login_attempts WHERE login_key=?",key); return out; }
  catch(e){
    const adminOut=await adminUserLogin(db,env,identifier,password);
    if(adminOut){await run(db,"DELETE FROM user_login_attempts WHERE login_key=?",key);return adminOut;}
    if(e?.code==="login_failed"){let count=Number(row?.failure_count||0),start=Number(row?.window_start||now);if(start<floor){count=0;start=now}count++;const blocked=count>=5?now+15*60_000:null;await run(db,`INSERT INTO user_login_attempts(login_key,window_start,failure_count,blocked_until,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(login_key) DO UPDATE SET window_start=excluded.window_start,failure_count=excluded.failure_count,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at`,key,start,count,blocked,now);}throw e;
  }
}
function cleanCreateFeature(raw={}) {
  const f=raw&&typeof raw==="object"?raw:{};
  return {
    clockConfig: normalizeClockConfig(f.clockConfig&&typeof f.clockConfig==="object"?f.clockConfig:{mode:"untimed"}),
    voiceEnabled:!!f.voiceEnabled,
    playerChatSlowMs:Math.max(0,Math.min(60000,Number(f.playerChatSlowMs)||0)),
    spectatorChatSlowMs:Math.max(0,Math.min(60000,Number(f.spectatorChatSlowMs)||0)),
  };
}

async function createRoom(request, env) {
  if (!env?.ROOMS) throw new HttpError(503,"missing_binding","缺少 ROOMS → GameRoom Durable Object binding。");
  const body=await request.json(); const gameId=String(body.gameId||""); if(!GAME_IDS.includes(gameId)) throw new HttpError(400,"unknown_game","未知遊戲。");
  const user=await currentUserMaybe(env,request); const adminPlayer=await adminPlayerEntitlement(env,request); const db=env.BOARDVERSE_DB||null;
  if(db && await setting(db,"maintenance_mode",false) && !adminPlayer) throw new HttpError(503,"maintenance","目前暫停建立新房間；進行中的房間不受影響。");
  const feature=cleanCreateFeature(body.feature);
  if (gameId === "qiguo") { feature.voiceEnabled = false; feature.clockConfig = { mode: "untimed" }; }
  let roomId="", custom=false, customPolicy=null;
  const desired=String(body.customRoomCode||feature.customRoomCode||"").toUpperCase().trim();
  if(desired){
    if(!ROOM_CODE_RE.test(desired)) throw new HttpError(400,"room_code_invalid","自訂房號必須完全符合現行 6 碼 A-Z（排除易混淆字元）與 2-9 規則。");
    if(!adminPlayer && (!db||!user)) throw new HttpError(401,"login_required","自訂房號只提供已登入且完成 Email 驗證的會員或管理員使用。");
    if(adminPlayer) customPolicy={ownerGraceMinutes:30,customRoomsPerDay:null,presetSlots:10};
    else { const check=await canCreateCustomRoom(db,user); if(!check.ok) throw new HttpError(403,"custom_room_denied",check.reason||"目前不能使用自訂房號。"); customPolicy=check.policy; }
    roomId=desired; custom=true;
  } else roomId=randomRoomCode();
  const initFeature={...feature,roomCodeType:custom?"custom":"random",ownerUserId:user?.id||(adminPlayer?`admin:${adminPlayer.user}`:null),ownerGraceMs:custom?Number(customPolicy?.ownerGraceMinutes||10)*60_000:null};
  body.settings = body.settings && typeof body.settings === "object" ? { ...body.settings } : {};
  if(initFeature.voiceEnabled || gameId === "qiguo") body.settings.queueEnabled=false;
  const target=new Request("https://boardverse.internal/init",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({roomId,roomName:body.roomName,playerName:body.playerName,gameId,isPrivate:!!body.privateRoom,rules:body.rules||{},returnPassword:String(body.returnPassword||""),settings:body.settings||{},feature:initFeature})});
  const res=await roomStub(env,roomId).fetch(target); const data=await res.json().catch(()=>({message:"建立房間失敗。"})); if(!res.ok) return json(data,res.status);
  try { await roomStub(env,LOBBY_NAME).fetch(new Request("https://boardverse.internal/lobby/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data.lobby)})); } catch {}
  if(custom&&db&&user&&!adminPlayer) await consumeCustomRoom(db,user.id);
  return json(data,201);
}

async function enterRoomProxy(request, env, roomId, legacyJoin=false) {
  const body=await request.json(); const role=legacyJoin?"player":(body.role==="spectator"?"spectator":"player");
  const target=new Request("https://boardverse.internal/enter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({playerName:body.playerName,returnPassword:String(body.returnPassword||""),role,sessionToken:String(body.sessionToken||"")})});
  const res=await roomStub(env,roomId).fetch(target), data=await res.json().catch(()=>({message:"進入房間失敗。"}));
  if(res.ok){ const user=await currentUserMaybe(env,request); if(user){ try { await roomStub(env,roomId).fetch(new Request("https://boardverse.internal/feature/attach-user",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:data.token,userId:user.id})})); } catch {} } }
  return json(data,res.status);
}

async function enhancedLegacy(request, env) {
  const response=await compatApp.fetch(request,env); const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html")) return response;
  const body=enhanceLegacyHtml(await response.text()); const headers=new Headers(response.headers);
  headers.delete("content-length"); headers.set("content-security-policy","default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; connect-src 'self' ws: wss: https://api.resend.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data:; media-src 'self' blob:; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(body,{status:response.status,headers});
}

function jsonWithCookie(data,status,cookieValue){return json(data,status,cookieValue?{"set-cookie":cookieValue}:{});}

async function route(request, env) {
  const url=new URL(request.url), path=url.pathname, method=request.method.toUpperCase(); let m;
  if(path==="/health"&&method==="GET") return json({ok:true,app:"BoardVerse",version:APP_VERSION,durableObjectBinding:!!env.ROOMS,globalChatBinding:!!env.GLOBAL_CHAT,databaseBinding:!!env.BOARDVERSE_DB});
  if(path==="/api/announcements"&&method==="GET") return json({ok:true,items:env.BOARDVERSE_DB?await activeAnnouncements(env.BOARDVERSE_DB):[]});
  if(path==="/api/me"&&method==="GET") { const user=await currentUserMaybe(env,request); if(!user)return json({ok:true,user:null}); const membership=await getUserMembership(env.BOARDVERSE_DB,user.id); await noteActivity(env.BOARDVERSE_DB,user.id).catch(()=>{}); return json({ok:true,user:{id:user.id,username:user.username_display,email:user.email_normalized},membership:{gp:membership.gp,level:membership.level,name:membership.policy.name,reputation:membership.reputation,presetSlots:membership.policy.presetSlots}}); }

  if(path==="/register"&&method==="GET") return authPage("register");
  if(path==="/register"&&method==="POST") { const db=requireDb(env), b=await bodyInput(request); await registerUser(db,env,request,b,baseUrl(request)); return authPage("login","註冊完成，請查看 Email 並先完成驗證。"); }
  if(path==="/resend-verification"&&method==="GET") return authPage("resend");
  if(path==="/resend-verification"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); await resendVerification(db,env,request,b.identifier,baseUrl(request)); return authPage("login","若帳號存在且尚未驗證，驗證信已重新送出。"); }
  if(path==="/api/resend-verification"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); await resendVerification(db,env,request,b.identifier||b.email,baseUrl(request)); return json({ok:true,message:"若帳號尚待驗證，驗證信已重新送出。"}); }
  if(path==="/verify"&&method==="GET") { const db=requireDb(env); await verifyEmailToken(db,url.searchParams.get("token")||""); return authPage("login","Email 驗證完成，現在可以登入。"); }
  if(path==="/login"&&method==="GET") return authPage("login");
  if(path==="/login"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request), result=await guardedLogin(db,env,request,b.identifier,b.password); return redirect("/account",303,{"set-cookie":result.session.setCookie}); }
  if(path==="/logout"&&method==="GET") { if(env.BOARDVERSE_DB)await revokeCurrentSession(env.BOARDVERSE_DB,request); return redirect("/",303,{"set-cookie":clearCookie(USER_COOKIE)}); }
  if(path==="/forgot"&&method==="GET") return forgotPage();
  if(path==="/forgot"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); await requestPasswordReset(db,env,request,b.identifier,baseUrl(request)); return forgotPage("若帳號存在，重設信已送出。請避免重複要求寄送。"); }
  if(path==="/reset"&&method==="GET") return resetPage(url.searchParams.get("token")||"");
  if(path==="/reset"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); await resetPassword(db,b.token,b.password); return authPage("login","密碼已更新；舊 Session 已撤銷，請重新登入。"); }
  if(path==="/activate"&&method==="GET") return activatePage(url.searchParams.get("token")||"");
  if(path==="/activate"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); await activateAdminUser(db,b.token,b.password); return authPage("login","帳號已啟用，請登入。"); }
  if(path==="/account"&&method==="GET") { const db=requireDb(env),user=await sessionUser(db,request); if(!user)return redirect("/login"); const m=await getUserMembership(db,user.id), presets=await listPresets(db,user.id); return accountPage(user,{gp:m.gp,level:m.level,name:m.policy.name,reputation:m.reputation,presetSlots:m.policy.presetSlots},presets); }
  if(path==="/api/checkin"&&method==="POST") { const db=requireDb(env),user=await sessionUser(db,request); if(!user)throw new HttpError(401,"login_required","請先登入。"); const result=await checkIn(db,user.id); const ct=request.headers.get("content-type")||""; return ct.includes("application/json")?json({ok:true,...result}):redirect("/account"); }
  if(path==="/api/presets"&&method==="GET") { const db=requireDb(env),user=await sessionUser(db,request); if(!user)throw new HttpError(401,"login_required","請先登入。"); return json({ok:true,items:await listPresets(db,user.id)}); }
  if(path==="/api/presets"&&method==="POST") { const db=requireDb(env),user=await sessionUser(db,request); if(!user)throw new HttpError(401,"login_required","請先登入。"); return json({ok:true,preset:await savePreset(db,user,await request.json())}); }
  m=path.match(/^\/api\/presets\/([^/]+)$/); if(m&&method==="DELETE") { const db=requireDb(env),user=await sessionUser(db,request); if(!user)throw new HttpError(401,"login_required","請先登入。"); return json({ok:true,...await deletePreset(db,user.id,decodeURIComponent(m[1]))}); }

  if(path==="/api/rooms"&&method==="POST") return createRoom(request,env);
  m=path.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(enter|join)$/); if(m&&method==="POST") return enterRoomProxy(request,env,m[1],m[2]==="join");

  if(path==="/report"&&method==="GET") return reportPage(env.TURNSTILE_SITE_KEY||"",{roomId:url.searchParams.get("roomId"),gameId:url.searchParams.get("gameId"),replayId:url.searchParams.get("replayId"),targetUserId:url.searchParams.get("targetUserId"),currentUrl:url.searchParams.get("currentUrl")});
  if(path==="/report"&&method==="POST") { const db=requireDb(env),user=await currentUserMaybe(env,request),b=await bodyInput(request); b.turnstileToken=b["cf-turnstile-response"]||b.turnstileToken; const guest=parseCookies(request)[GUEST_COOKIE]||null; const result=await createReport(db,env,request,b,{userId:user?.id||null,guestKey:guest}); return html(`<meta charset="utf-8"><p>回報已建立：${result.id}</p><p><a href="/">返回 BoardVerse</a></p>`); }

  m=path.match(/^\/replay\/([^/]+)$/); if(m&&method==="GET") { const r=await publicReplayByToken(requireDb(env),decodeURIComponent(m[1])); if(!r)throw new HttpError(404,"replay_unavailable","Replay 不存在或公開期限已結束。"); return replayResponse(r, `/replay/${encodeURIComponent(decodeURIComponent(m[1]))}/download`); }
  m=path.match(/^\/replay\/([^/]+)\/download$/); if(m&&method==="GET") { const r=await publicReplayByToken(requireDb(env),decodeURIComponent(m[1])); if(!r)throw new HttpError(404,"replay_unavailable","Replay 不存在或公開期限已結束。"); return offlineReplayResponse(r); }

  if(path==="/api/global-chat/identity"&&method==="POST") {
    if(!env.GLOBAL_CHAT)throw new HttpError(503,"global_chat_unavailable","GLOBAL_CHAT Durable Object 尚未綁定。");
    if(!env.ADMIN_SESSION_SECRET)throw new HttpError(503,"global_chat_unconfigured","ADMIN_SESSION_SECRET 尚未設定。");
    const user=await currentUserMaybe(env,request); let guest=parseCookies(request)[GUEST_COOKIE], set=null; if(!user&&!guest){guest=randomToken(18);set=cookie(GUEST_COOKIE,guest,{maxAge:30*24*3600,httpOnly:true,sameSite:"Lax"});}
    const identity=await signPayload(env.ADMIN_SESSION_SECRET,{kind:user?"user":"guest",id:user?.id||guest,name:user?.username_display||`Guest-${String(guest).slice(0,6)}`,iat:Date.now(),exp:Date.now()+2*60*60_000});
    return jsonWithCookie({ok:true,identity},200,set);
  }
  if(path==="/ws/global"&&method==="GET") { if(!env.GLOBAL_CHAT)throw new HttpError(503,"global_chat_unavailable","GLOBAL_CHAT 尚未綁定。"); const target=new URL("https://boardverse.internal/ws"); target.searchParams.set("identity",url.searchParams.get("identity")||""); return env.GLOBAL_CHAT.getByName("global").fetch(new Request(target,request)); }

  if(path==="/admin/login"&&method==="GET") return adminLoginPage();
  if(path==="/admin/login"&&method==="POST") { const db=requireDb(env),b=await bodyInput(request); const a=await adminLogin(db,env,request,b.username,b.password); await run(db,"INSERT INTO audit_logs(id,admin_actor,action_type,target_type,target_id,reason,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",crypto.randomUUID(),a.payload.user,"admin.login","admin",a.payload.user,null,null,null,Date.now()); return redirect("/admin/",303,{"set-cookie":a.setCookie}); }
  if(path==="/admin/logout"&&method==="GET") { const db=requireDb(env); const adm=await requireAdmin(env,request); await run(db,"INSERT INTO audit_logs(id,admin_actor,action_type,target_type,target_id,reason,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",crypto.randomUUID(),adm.user,"admin.logout","admin",adm.user,null,null,null,Date.now()); return redirect("/admin/login",303,{"set-cookie":clearCookie(ADMIN_COOKIE,"/admin")}); }
  if(path==="/admin/play"&&method==="GET") { await requireAdmin(env,request); const entitlement=await issueAdminPlayerEntitlement(env); return redirect("/",303,{"set-cookie":entitlement}); }
  if(path==="/admin/"&&method==="GET") { await requireAdmin(env,request); return adminDashboardPage(); }
  if(path.startsWith("/admin/api/")) { const db=requireDb(env),adm=await requireAdmin(env,request); const result=await adminApi({db,env,request,path,url,actor:adm.user}); return json({ok:true,data:result}); }
  m=path.match(/^\/admin\/replay\/([^/]+)$/); if(m&&method==="GET") { await requireAdmin(env,request); const r=await replayById(requireDb(env),m[1]); if(!r)throw new HttpError(404,"not_found","找不到 Replay。"); return replayResponse(r); }
  m=path.match(/^\/admin\/replay\/([^/]+)\/download$/); if(m&&method==="GET") { await requireAdmin(env,request); const r=await replayById(requireDb(env),m[1]); if(!r)throw new HttpError(404,"not_found","找不到 Replay。"); return offlineReplayResponse(r); }

  return enhancedLegacy(request,env);
}

async function scheduled(_event, env) {
  if(!env.BOARDVERSE_DB)return; const db=env.BOARDVERSE_DB, now=Date.now();
  await ensureDbSchema(db);
  await cleanupReplayArchive(db,now);
  await run(db,"DELETE FROM user_sessions WHERE expires_at<=? OR (revoked_at IS NOT NULL AND revoked_at<?)",now,now-7*24*60*60_000);
  await run(db,"DELETE FROM email_tokens WHERE expires_at<=? OR (used_at IS NOT NULL AND used_at<?)",now,now-24*60*60_000);
  await run(db,"DELETE FROM email_rate_limits WHERE last_sent_at<?",now-3*24*60*60_000);
  await run(db,"DELETE FROM admin_login_attempts WHERE updated_at<?",now-24*60*60_000);
  await run(db,"DELETE FROM user_login_attempts WHERE updated_at<?",now-24*60*60_000);
  await run(db,"DELETE FROM chat_mutes WHERE muted_until IS NOT NULL AND muted_until<=?",now);
  await run(db,"UPDATE users SET status='active',suspended_until=NULL,updated_at=? WHERE status='suspended' AND suspended_until IS NOT NULL AND suspended_until<=?",now,now);
  await run(db,"DELETE FROM active_rooms WHERE status='closed' AND closed_at<?",now-7*24*60*60_000);
}

export default {
  async fetch(request,env){ try{if(env?.BOARDVERSE_DB) await ensureDbSchema(env.BOARDVERSE_DB); return await route(request,env);}catch(e){ if((new URL(request.url)).pathname.startsWith('/admin')&&e?.status===401)return redirect('/admin/login'); return toErrorResponse(e);} },
  scheduled,
};
