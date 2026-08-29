import baseApp from "./index-v011.js";
import { adminPlayerEntitlement } from "./admin/auth.js";
import { setting, withDatabaseEnv } from "./core/db.js";
import { errorJson } from "./core/http.js";
import { homePage, maintenancePage } from "./ui/home-v012.js";
import { PUBLIC_ANNOUNCEMENT_SCRIPT } from "./ui/public-announcements.js";

export { BoardVerseDb, BoardVerseDbV011, GameRoom, GameRoomV011, GlobalChat, GlobalChatV011 } from "./index-v011.js";

const MAINTENANCE_ALLOW = new Set(["/health", "/api/announcements", "/sw.js", "/favicon.ico"]);

function adminPath(pathname) { return pathname === "/admin" || pathname.startsWith("/admin/"); }
function wantsHtml(request) { return (request.headers.get("accept") || "").includes("text/html") || request.method === "GET" && !request.url.includes("/api/"); }
async function maintenanceEnabled(env) {
  if (!env?.BOARDVERSE_DB) return false;
  try { return !!(await setting(env.BOARDVERSE_DB, "maintenance_mode", false)); }
  catch { return false; }
}
async function maintenanceBypass(env, request, pathname) {
  if (adminPath(pathname) || MAINTENANCE_ALLOW.has(pathname)) return true;
  try { return !!(await adminPlayerEntitlement(env, request)); }
  catch { return false; }
}
function rewritePlayRequest(request) {
  const url = new URL(request.url);
  url.pathname = "/";
  return new Request(url.toString(), { method: "GET", headers: request.headers, redirect: request.redirect });
}
async function addPublicAnnouncements(response, pathname) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const source = await response.text();
  if (source.includes('id="boardverse-public-announcements"')) return new Response(source, { status: response.status, statusText: response.statusText, headers: response.headers });
  const body = /<\/head>/i.test(source) ? source.replace(/<\/head>/i, PUBLIC_ANNOUNCEMENT_SCRIPT + "</head>") : PUBLIC_ANNOUNCEMENT_SCRIPT + source;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const effectiveEnv = withDatabaseEnv(env);

    if (await maintenanceEnabled(effectiveEnv) && !(await maintenanceBypass(effectiveEnv, request, pathname))) {
      return wantsHtml(request) ? maintenancePage() : errorJson("BoardVerse 目前維護中，請稍後再試。", 503, "maintenance");
    }

    if (request.method === "GET" && pathname === "/") return homePage();

    const upstreamRequest = request.method === "GET" && pathname === "/play" ? rewritePlayRequest(request) : request;
    const response = await baseApp.fetch(upstreamRequest, effectiveEnv, ctx);
    return addPublicAnnouncements(response, pathname);
  },
  scheduled(event, env, ctx) {
    return baseApp.scheduled(event, withDatabaseEnv(env), ctx);
  },
};
