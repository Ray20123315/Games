import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { cardPortalPage } from "../src/cards/page.js";
import { botPage } from "../src/bot/page.js";
import { injectCardBoardParity } from "../src/ui/card-board-parity.js";
import { injectSingleplayerBoardParity } from "../src/ui/singleplayer-board-parity.js";
import { enhanceV025Html } from "../src/ui/page-parity-i18n-v025.js";
import { enhanceV026Html } from "../src/ui/page-parity-v026.js";
import { enhanceV028Html } from "../src/ui/page-parity-v028.js";
import { injectThemeHardening } from "../src/ui/theme-hardening.js";
import { injectThemeSurfaceFix } from "../src/ui/theme-surface-fix.js";
function scripts(source){return [...String(source).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean)}
function compile(name,html){for(const[i,script]of scripts(html).entries())new vm.Script(script,{filename:`${name}-${i}.js`})}
const card=enhanceV028Html(enhanceV026Html(enhanceV025Html(injectCardBoardParity(cardPortalPage()),"/cards"),"/cards"),"/cards","0.1.2");
for(const marker of ["boardverse-v028-universal-shell-style","boardverse-v028-universal-shell-script","topbar bv-v028-topbar","pageBgBlack","pageBgWhite","soundEnabled","soundVolume","notifyBtn","bvV028Account","cardReturnPassword","function unoColorName(c)","綠色","绿色","Green"])assert.ok(card.includes(marker),marker);
assert.match(card,/returnPassword:\$\('cardReturnPassword'\)\?\.value\|\|''/);assert.doesNotMatch(card,/data-theme=["']scifi["']/i);compile("card-v028",card);
const room=enhanceV028Html(enhanceV026Html(enhanceV025Html(injectCardBoardParity(cardPortalPage("ABC234")),"/cards/ABC234"),"/cards/ABC234"),"/cards/ABC234","0.1.2");assert.match(room,/cardJoinReturnPassword/);assert.match(room,/unoColorName\(g\.currentColor\)/);compile("card-room-v028",room);
const single=enhanceV028Html(enhanceV026Html(enhanceV025Html(injectSingleplayerBoardParity(botPage()),"/singleplayer"),"/singleplayer"),"/singleplayer","0.1.2");for(const marker of ["boardverse-v028-universal-shell-style","topbar bv-v028-topbar","pageBgBlack","pageBgWhite","soundEnabled","notifyBtn","bvV028Account"])assert.ok(single.includes(marker),marker);compile("single-v028",single);
const theme=injectThemeHardening('<html><head></head><body><div id="pageThemeChoice"><button id="pageBgBlack"></button><button id="pageBgWhite"></button></div></body></html>');assert.match(theme,/body\.page-theme-black/);assert.match(theme,/body\.page-theme-white/);assert.match(theme,/document\.startViewTransition/);assert.doesNotMatch(theme,/科幻|Sci-fi|data-theme=["']scifi["']/i);compile("theme-v028",theme);
const surface=injectThemeSurfaceFix('<html lang="zh-Hant-TW"><head></head><body></body></html>');assert.match(surface,/--p:#ffffff!important/);assert.match(surface,/--g:#526b7a!important/);assert.doesNotMatch(surface,/科幻|Sci-fi/);compile("surface-v028",surface);
const entry=await readFile(new URL("../src/index-v025.js",import.meta.url),"utf8");for(const marker of ["./ui/page-parity-v028.js","enhanceV028Html","APP_VERSION","x-boardverse-ui-hotfix","v028"])assert.ok(entry.includes(marker),marker);
const routes=await readFile(new URL("../src/cards/routes.js",import.meta.url),"utf8");for(const marker of ["sessionUser","adminPlayerEntitlement","cardIdentity","ownerUserId","returnPassword","/card/state?token="])assert.ok(routes.includes(marker),marker);
const cardRoom=await readFile(new URL("../src/cards/room.js",import.meta.url),"utf8");for(const marker of ["PBKDF2","passwordMatches","ownerUserId","userId","回場密碼"])assert.ok(cardRoom.includes(marker),marker);
console.log("ui-parity-v028.test: PASS");
