import assert from "node:assert/strict";
import { accountPage } from "../src/ui/pages.js";

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

console.log("admin-display.test: PASS (admin mapping has distinct account presentation without affecting normal users)");
