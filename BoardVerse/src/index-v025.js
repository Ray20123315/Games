import appV024 from "./index-v024.js";
import { enhanceV025Html } from "./ui/page-parity-i18n-v025.js";
export * from "./index-v024.js";
function normalizeV025(body){return String(body||"").replace("levels:['','入門','简单','普通','困难','专家']","levels:['','入门','简单','普通','困难','专家']")}
async function polish(response,path){if(!String(response?.headers?.get("content-type")||"").includes("text/html"))return response;const body=normalizeV025(enhanceV025Html(await response.text(),path));const headers=new Headers(response.headers);headers.delete("content-length");headers.set("cache-control","no-store");headers.set("x-boardverse-ui-hotfix","v025");return new Response(body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(req,env,ctx){const path=new URL(req.url).pathname;return polish(await appV024.fetch(req,env,ctx),path)},scheduled(e,env,ctx){return appV024.scheduled(e,env,ctx)}};
