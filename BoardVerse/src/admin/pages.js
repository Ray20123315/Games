import { html } from "../core/http.js";
import { ADMIN_WORKBENCH_SCRIPT, ADMIN_WORKBENCH_STYLE, adminDashboardMarkup } from "./workbench.js";

const shell=(title,body,script="")=>html(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${ADMIN_WORKBENCH_STYLE}</style></head><body>${body}${script?`<script>${script}</script>`:""}</body></html>`);

export function adminLoginPage(message="") {
  return shell("BoardVerse Admin Login",`<main class="login-frame"><div class="brand-row"><span class="brand-mark" aria-hidden="true"></span><div><h1>BoardVerse 管理後台</h1><p>Administrator access</p></div></div>${message?`<p class="login-error">${escapeHtml(message)}</p>`:""}<form method="post" action="/admin/login"><div class="field"><label for="adminUsername">管理員帳號</label><input class="input" id="adminUsername" name="username" autocomplete="username" placeholder="Admin username" required></div><div class="field"><label for="adminPassword">密碼</label><input class="input" id="adminPassword" name="password" type="password" autocomplete="current-password" placeholder="Password" required></div><button class="btn gold" type="submit" style="width:100%;margin-top:8px">登入</button></form></main>`);
}

export function adminDashboardPage() {
  return shell("BoardVerse Admin",adminDashboardMarkup(),ADMIN_WORKBENCH_SCRIPT);
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
