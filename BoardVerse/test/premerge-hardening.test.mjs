import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const admin = await readFile(new URL('src/admin/data-source-switch.js', root), 'utf8');
const adminUi = await readFile(new URL('src/ui/admin-data-source.js', root), 'utf8');
const modal = await readFile(new URL('src/ui/modal-i18n-hardening.js', root), 'utf8');
const theme = await readFile(new URL('src/ui/theme-hardening.js', root), 'utf8');
const entry = await readFile(new URL('src/index-v024.js', root), 'utf8');

for (const marker of ['adminDataSourceFromRequest','adminDataSourceAvailability','adminDataSourceEnv','admin_d1_room_read_only','emergencyAdminRead']) assert.ok(admin.includes(marker), marker);
assert.match(admin, /source\s*===\s*["']d1["'][\s\S]*?request\.method\s*!==\s*["']GET["'][\s\S]*?D1_ROOM_WRITE_RE\.test\(url\.pathname\)/);
assert.match(admin, /BOARDVERSE_DB/);
assert.match(admin, /BOARDVERSE_EMERGENCY_D1/);

for (const marker of ['boardverseAdminDataSource','bvAdminDataSource','bvAdminSourceBadge','defaultSource','D1 房間檢視為唯讀']) assert.ok(adminUi.includes(marker), marker);
assert.match(adminUi, /searchParams\.set\(["']source["'],source\)/);
assert.match(adminUi, /!source\|\|!available\[source\]/);
assert.match(adminUi, /available\[defaultSource\]\?defaultSource/);
assert.ok(adminUi.includes('location.assign(u.href)'));
assert.ok(adminUi.includes('window.fetch=function'));

for (const marker of ['MutationObserver','characterData:true','bvAuthErrorTitle','bvCreateErrorClose','Unable to complete the action','關閉所選房間']) assert.ok(modal.includes(marker), marker);

for (const marker of ['document.startViewTransition','prefers-reduced-motion','page-theme-black','page-theme-white','--accent:#a9bbc8','--accent:#526b7a','bv-theme-transitioning']) assert.ok(theme.includes(marker), marker);
assert.doesNotMatch(theme, /科幻|Sci-fi|data-theme=["']scifi["']/i);
const blackAccent = theme.match(/body\.page-theme-black\{[\s\S]*?--accent:([^;!]+)/)?.[1];
const whiteAccent = theme.match(/body\.page-theme-white\{[\s\S]*?--accent:([^;!]+)/)?.[1];
assert.ok(blackAccent && whiteAccent);
assert.equal(new Set([blackAccent, whiteAccent]).size, 2, 'black/white theme accents must remain distinct but neutral');

for (const src of [adminUi, modal, theme]) {
  const match = src.match(/String\.raw`<script[^>]*>([\s\S]*?)<\/script>`/);
  assert.ok(match, 'inline script missing');
  new vm.Script(match[1]);
}

for (const marker of ['adminDataSourceRoute','injectAdminDataSourceUi','injectModalI18nHardening','injectThemeHardening','adminDataSourceEnv']) assert.ok(entry.includes(marker), marker);
assert.match(entry, /path\.startsWith\(["']\/admin["']\)/);
console.log('premerge-hardening.test: PASS');
