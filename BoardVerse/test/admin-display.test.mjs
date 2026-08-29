import assert from "node:assert/strict";
import vm from "node:vm";
import { accountPage } from "../src/ui/pages.js";
import { IDENTITY_BADGE_SCRIPT } from "../src/ui/identity-badges.js";
import { effectiveMembership, publicAdminIdentity, publicGuestIdentity, publicIdentityForUser } from "../src/auth/identity.js";

const baseMembership = { level: 1, name: "新進棋友", gp: 42, reputation: 100, presetSlots: 1, policy: { level: 1, name: "新進棋友", gp: 0, presetSlots: 1 } };
const ownerUser = {
  username_display: "RootAdmin",
  email_normalized: "admin-123@boardverse.invalid",
  password_algorithm: "ADMIN_SECRET",
};
const ownerMembership = effectiveMembership(ownerUser, baseMembership);
assert.equal(ownerMembership.level, 5);
assert.equal(ownerMembership.gp, 5000);
assert.equal(ownerMembership.policy.presetSlots, 10);
assert.equal(ownerMembership.maxed, true);
assert.deepEqual(publicIdentityForUser(ownerUser, ownerMembership).role, "owner");
assert.equal(publicIdentityForUser(ownerUser, ownerMembership).badge, "OWNER");
assert.equal(publicAdminIdentity("Moderator").badge, "ADMIN");
assert.equal(publicGuestIdentity().badge, "訪客");

const ownerResponse = accountPage(ownerUser, {
  level: ownerMembership.level,
  name: ownerMembership.policy.name,
  gp: ownerMembership.gp,
  reputation: 100,
  presetSlots: ownerMembership.policy.presetSlots,
  isOwner: true,
}, []);
const ownerHtml = await ownerResponse.text();
assert.match(ownerHtml, /class="owner-badge"[^>]*>OWNER<\/span>/);
assert.match(ownerHtml, /站主身分/);
assert.match(ownerHtml, /MAX · Lv\.5/);
assert.match(ownerHtml, /GP 5000/);
assert.match(ownerHtml, /永久滿級/);
assert.match(ownerHtml, /進入管理後台/);
assert.doesNotMatch(ownerHtml, /每日簽到/);
assert.match(ownerHtml, /bvOwnerGlow/);
assert.match(ownerHtml, /bvOwnerShine/);

const normalResponse = accountPage({
  username_display: "PlayerOne",
  email_normalized: "player@example.com",
  password_algorithm: "PBKDF2-HMAC-SHA-256",
}, { level: 1, name: "新進棋友", gp: 42, reputation: 100, presetSlots: 1 }, []);
const normalHtml = await normalResponse.text();
assert.doesNotMatch(normalHtml, /class="owner-badge"/);
assert.match(normalHtml, /Lv\.1/);
assert.match(normalHtml, /每日簽到/);

for (const marker of ["OWNER", "ADMIN", "訪客", "bv-id-owner", "bvIdOwnerGlow", "bvIdOwnerShine", "/api/me"]) {
  assert.ok(IDENTITY_BADGE_SCRIPT.includes(marker), `identity badge script missing ${marker}`);
}
assert.ok(IDENTITY_BADGE_SCRIPT.includes(String.raw`Lv\.\d+`), "member badge matcher must recognize Lv.N labels");
assert.doesNotMatch(IDENTITY_BADGE_SCRIPT, /ADMIN_PASSWORD|ADMIN_USERNAME/);
const scripts = [...IDENTITY_BADGE_SCRIPT.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], { filename: "identity-badges.inline.js" });

console.log("admin-display.test: PASS (guest/member/admin/owner identities stay distinct and OWNER is permanently maxed)");
