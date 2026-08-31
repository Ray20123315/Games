import appV023 from "./index-v023.js";
import { errorJson } from "./core/http.js";
import { handleCardRoutes } from "./cards/routes.js";
import { handleSingleplayerRoutes } from "./bot/routes.js";
import { handlePlatformRoute } from "./ui/platform-router.js";
import { adminDataSourceRoute, adminDataSourceFromRequest, adminDataSourceAvailability, adminDataSourceDefault, adminDataSourceEnv } from "./admin/data-source-switch.js";
import { injectAdminDataSourceUi } from "./ui/admin-data-source.js";
import { injectModalI18nHardening } from "./ui/modal-i18n-hardening.js";
import { injectThemeHardening } from "./ui/theme-hardening.js";
import { injectThemeSurfaceFix } from "./ui/theme-surface-fix.js";
export * from "./index-v023.js";
export { GameRoom } from "./cards/do-room.js";
function fail(e){return errorJson(e?.message||"BoardVerse 操作失敗。",Math.max(400,Math.min(599,Number(e?.status)||500)),e?.code||"internal_error")}
async function polish(response,path,env){if(!String(response.headers.get("content-type")||"").includes("text/html"))return response;let body=await response.text();body=injectThemeHardening(body);body=injectModalI18nHardening(body);body=injectThemeSurfaceFix(body);if(path.startsWith("/admin"))body=injectAdminDataSourceUi(body,{available:adminDataSourceAvailability(env),defaultSource:adminDataSourceDefault(env)});const h=new Headers(response.headers);h.delete("content-length");h.set("cache-control","no-store");return new Response(body,{status:response.status,statusText:response.statusText,headers:h})}
export default{async fetch(req,env,ctx){try{const path=new URL(req.url).pathname;const single=await handleSingleplayerRoutes(req);if(single)return single;const platform=await handlePlatformRoute(req,env,ctx,(r,e,c)=>appV023.fetch(r,e,c));if(platform)return polish(platform,path,env);const sourced=await adminDataSourceRoute(req,env,ctx,(r,e,c)=>appV023.fetch(r,e,c));if(sourced)return sourced;const cards=await handleCardRoutes(req,env);if(cards)return polish(cards,path,env);const pageSource=path.startsWith("/admin")?adminDataSourceFromRequest(req):null,effectiveEnv=pageSource?adminDataSourceEnv(env,pageSource):env,response=await appV023.fetch(req,effectiveEnv,ctx);if(pageSource==="do"&&path.startsWith("/admin")&&response.status>=500&&env?.BOARDVERSE_D1&&String(response.headers.get("content-type")||"").toLowerCase().includes("json")){const target=new URL(req.url);target.searchParams.set("source","d1");target.searchParams.set("source_error","do_unavailable");return Response.redirect(target,303)}return polish(response,path,env)}catch(e){return fail(e)}},scheduled(e,env,ctx){return appV023.scheduled(e,env,ctx)}};
