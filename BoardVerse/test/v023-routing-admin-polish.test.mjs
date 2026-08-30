import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { EMERGENCY_ADMIN_UI, improveV023Html } from "../src/ui/v023-polish.js";

const entry = await readFile(new URL("../src/index-v023.js", import.meta.url), "utf8");
const polish = await readFile(new URL("../src/ui/v023-polish.js", import.meta.url), "utf8");
const emergencyAdmin = await readFile(new URL("../src/emergency/d1-admin-view.js", import.meta.url), "utf8");
const adminV012 = await readFile(new URL("../src/index-v012.js", import.meta.url), "utf8");

for (const marker of [
  'canonicalPublicRoute', 'Response.redirect', '"/home"', '"/play"',
  'internal.searchParams.set("play", "1")', 'emergencyAdminRead', 'improveV023Html',
  'rewriteAdminPlayRedirect', 'headers.set("location", "/play")',
]) assert.ok(entry.includes(marker), `v023 routing missing ${marker}`);

for (const marker of [
  '#bvRoomSettingsWorkspace .bv-rs-grid', 'height:42px!important',
  '#bvRoomSettingsWorkspace .bv-rs-check', 'boardverse-admin-login-center-fix',
  'body{display:grid!important;place-items:center!important', 'boardverse-emergency-admin-ui',
  '緊急 D1 模式：管理後台會直接顯示目前 D1 緊急房間資料',
  'BoardVerse 棋盤宇宙', 'rel="canonical"', 'application/ld+json',
]) assert.ok(polish.includes(marker), `v023 polish missing ${marker}`);

assert.match(adminV012, /body\{display:block!important;place-items:initial!important\}/, "regression fixture must retain the old dashboard override that previously affected admin login");

for (const marker of [
  'requireAdmin', 'ensureDbSchema', 'ensureEmergencySchema', 'emergency_rooms',
  'players_json', 'spectator_count', 'last_activity_at', 'emergency_mode: true',
  'x-boardverse-admin-data',
]) assert.ok(emergencyAdmin.includes(marker), `emergency admin view missing ${marker}`);
assert.match(emergencyAdmin, /status!='closed'/);
assert.doesNotMatch(emergencyAdmin, /env\.ROOMS/);

const emergencyScript = EMERGENCY_ADMIN_UI.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
assert.ok(emergencyScript, "emergency admin inline script missing");
new vm.Script(emergencyScript, { filename: "emergency-admin-ui.js" });

const synthetic = `<!doctype html><html><head><title>BoardVerse</title></head><body>
<div class="bv-home-brand">BOARD<b>VERSE</b></div>
<div class="bv-home-eyebrow">BOARDVERSE · MULTIPLAYER BOARD GAMES</div>
<a href="/?play=1">Play</a>
<footer class="bv-home-foot"><span>BoardVerse</span></footer>
<script>function showHome(){try{const u=new URL(location.href);return u.pathname==='/'&&u.searchParams.get('play')!=='1'}catch{return location.pathname==='/'} }</script>
</body></html>`;
const home = improveV023Html(synthetic, { pathname: "/home", requestUrl: "https://example.test/home" });
assert.match(home, /u\.pathname==='\/'\|\|u\.pathname==='\/home'/);
assert.match(home, /href="\/play"/);
assert.match(home, /棋盤宇宙/);
assert.match(home, /<title>BoardVerse 棋盤宇宙｜線上多人棋類遊戲<\/title>/);
assert.match(home, /rel="canonical" href="https:\/\/example\.test\/home"/);
assert.match(home, /name="description"/);
assert.match(home, /name="keywords"/);

const play = improveV023Html(synthetic, { pathname: "/play", requestUrl: "https://example.test/play" });
assert.match(play, /<title>BoardVerse 棋盤宇宙｜建立房間與遊戲設定<\/title>/);
assert.match(play, /rel="canonical" href="https:\/\/example\.test\/play"/);

const login = improveV023Html('<html><head></head><body><main class="login-frame"></main></body></html>', { pathname: "/admin/login", requestUrl: "https://example.test/admin/login" });
assert.match(login, /boardverse-admin-login-center-fix/);
assert.match(login, /place-items:center!important/);

const dashboard = improveV023Html('<html><head></head><body><div id="adminFrame"><div class="workspace"><div class="content-grid"></div></div></div></body></html>', { pathname: "/admin/", requestUrl: "https://example.test/admin/", emergencyAdmin: true });
assert.match(dashboard, /boardverse-emergency-admin-ui/);
assert.match(dashboard, /roomSelectAll/);
assert.match(dashboard, /batchTerminate/);

console.log("v023-routing-admin-polish.test: PASS");
