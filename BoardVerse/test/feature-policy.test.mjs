import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/ui/feature-policy.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../src/admin/pages.js", import.meta.url), "utf8");

assert.match(entry, /feature\.canReady = feature\.myRole === "player" && feature\.status === "waiting"/);
assert.doesNotMatch(entry, /feature\.canReady[^\n]*allSeatsFilled/);
assert.match(entry, /feature\.canVoice = !!feature\.canVoice && !!feature\.myUserId/);
assert.match(entry, /voiceLoginRequired/);
assert.match(entry, /async voiceSignal\(member, msg\)/);
assert.match(entry, /voice_login_required/);
assert.match(entry, /pathname === "\/api\/rooms"/);
assert.match(entry, /boardverse\.internal\/info/);
assert.match(entry, /FEATURE_POLICY_SCRIPT/);
assert.match(entry, /\/api\/voice-entitlement/);

assert.match(policy, /id="boardverse-feature-policy"/);
assert.match(policy, /\/api\/voice-entitlement/);
assert.match(policy, /bvVoiceLoginHint/);
assert.match(policy, /voiceLoginRequired/);
assert.doesNotMatch(policy, /mountAdminLevel/);
assert.doesNotMatch(policy, /bvAdminLevelCard/);

assert.match(admin, /class="summary-strip"/);
assert.match(admin, /flex-wrap:nowrap/);
assert.match(admin, /overflow-x:auto/);
assert.match(admin, /id="adminTabs"/);
assert.match(admin, /id="out" class="panel-body"/);
assert.match(admin, /\['level','帳號等級','账号等级','Account level','form'\]/);
assert.match(admin, /action:'level_set'/);
for (let level=1;level<=5;level++) assert.match(admin, new RegExp(`Lv\\.${level}`));
assert.match(admin, /房間強制操作/);
assert.match(admin, /全域設定/);
assert.match(admin, /帳號處分/);
assert.match(admin, /聊天室管理/);
assert.match(admin, /確認作弊處分/);

console.log("feature-policy.test: PASS (ready toggle, login-only voice, admin dashboard policy)");
