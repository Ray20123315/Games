import assert from "node:assert/strict";
import vm from "node:vm";
import { HOME_SHELL_SCRIPT } from "../src/ui/home-shell-safe.js";
import { CREATE_ROOM_ERROR_MODAL_SCRIPT } from "../src/ui/create-room-error-modal.js";
import { SITE_I18N_SCRIPT } from "../src/ui/site-i18n.js";

function scripts(source) {
  return [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

assert.match(HOME_SHELL_SCRIPT, /id="boardverse-safe-home"/);
assert.match(HOME_SHELL_SCRIPT, /root\.id='bvSafeHome'/);
assert.match(HOME_SHELL_SCRIPT, /u\.pathname==='\/'/);
assert.match(HOME_SHELL_SCRIPT, /searchParams\.get\('play'\)!=='1'/);
assert.match(HOME_SHELL_SCRIPT, /href="\/\?play=1"/);
assert.match(HOME_SHELL_SCRIPT, /進入遊戲設定/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /id="boardverse-create-error-modal"/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /u\.pathname==='\/api\/rooms'/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /!response\.ok/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /response\.clone\(\)\.json\(\)/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /建立房間失敗/);
assert.match(CREATE_ROOM_ERROR_MODAL_SCRIPT, /d&&d\.message/);
assert.ok(SITE_I18N_SCRIPT.indexOf('id="boardverse-safe-home"') < SITE_I18N_SCRIPT.indexOf('id="boardverse-site-i18n"'));
assert.ok(SITE_I18N_SCRIPT.indexOf('id="boardverse-create-error-modal"') < SITE_I18N_SCRIPT.indexOf('id="boardverse-site-i18n"'));
for (const [name, source] of [["home", HOME_SHELL_SCRIPT], ["create-modal", CREATE_ROOM_ERROR_MODAL_SCRIPT]]) {
  const inline = scripts(source);
  assert.equal(inline.length, 1, `${name} should contain one inline script`);
  new vm.Script(inline[0], { filename: `${name}.inline.js` });
}

console.log("home-and-create-modal.test: PASS (safe homepage shell and create-room error modal)");