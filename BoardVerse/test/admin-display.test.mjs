import assert from "node:assert/strict";
import vm from "node:vm";
import { accountPage } from "../src/ui/pages.js";
import { HOME_SHELL_SCRIPT } from "../src/ui/home-shell-safe.js";

const membership = { level: 1, name: "新進棋友", gp: 42, reputation: 100, presetSlots: 1 };

const adminResponse = accountPage({
  username_display: "RootAdmin",
  email_normalized: "admin-123@boardverse.invalid",
  password_algorithm: "ADMIN_SECRET",
}, membership, []);
const adminHtml = await adminResponse.text();
assert.match(adminHtml, /class="admin-badge"[^>]*>ADMIN<\/span>/);
assert.match(adminHtml, /管理員身分/);
assert.match(adminHtml, /進入管理後台/);
assert.match(adminHtml, /href="\/admin\/"/);
assert.doesNotMatch(adminHtml, /會員<\/span>：Lv\.1/);

const normalResponse = accountPage({
  username_display: "PlayerOne",
  email_normalized: "player@example.com",
  password_algorithm: "PBKDF2-HMAC-SHA-256",
}, membership, []);
const normalHtml = await normalResponse.text();
assert.doesNotMatch(normalHtml, /class="admin-badge"/);
assert.doesNotMatch(normalHtml, /管理員身分/);
assert.match(normalHtml, /Lv\.1/);

assert.match(HOME_SHELL_SCRIPT, /id="bvHomeAccount"/);
assert.match(HOME_SHELL_SCRIPT, /class="admin-badge"/);
assert.match(HOME_SHELL_SCRIPT, /boardverseRole='admin'/);
assert.match(HOME_SHELL_SCRIPT, /ADMIN · /);
assert.match(HOME_SHELL_SCRIPT, /bv-admin-nav-chip/);
assert.doesNotMatch(HOME_SHELL_SCRIPT, /ADMIN_PASSWORD|ADMIN_USERNAME/);
const scripts = [...HOME_SHELL_SCRIPT.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], { filename: "admin-display-home.inline.js" });

console.log("admin-display.test: PASS (admin mapping has distinct account and public-nav presentation without affecting normal users)");
