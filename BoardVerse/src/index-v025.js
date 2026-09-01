import appV024 from "./index-v024.js";
import { APP_VERSION } from "./core/config.js";
import { enhanceV025Html } from "./ui/page-parity-i18n-v025.js";
import { enhanceV026Html } from "./ui/page-parity-v026.js";
import { enhanceV028Html } from "./ui/page-parity-v028.js";
import { fixV028UnoColorHtml } from "./ui/page-parity-v028-color-fix.js";
export * from "./index-v024.js";
function normalizeV025(body){return String(body||"").replace("levels:['','入門','简单','普通','困难','专家']","levels:['','入门','简单','普通','困难','专家']")}
async function polish(response,path){if(!String(response?.headers?.get("content-type")||"").includes("text/html"))return response;const base=normalizeV025(enhanceV025Html(await response.text(),path)),v026=enhanceV026Html(base,path),v028=enhanceV028Html(v026,path,APP_VERSION),body=fixV028UnoColorHtml(v028,path);const headers=new Headers(response.headers);headers.delete("content-length");headers.set("cache-control","no-store");headers.set("x-boardverse-ui-hotfix","v028");return new Response(body,{status:response.status,statusText:response.statusText,headers})}
export default{async fetch(req,env,ctx){const path=new URL(req.url).pathname;return polish(await appV024.fetch(req,env,ctx),path)},scheduled(e,env,ctx){return appV024.scheduled(e,env,ctx)}};
