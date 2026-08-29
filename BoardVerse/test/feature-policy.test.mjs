import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/ui/feature-policy.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../src/admin/pages.js", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../src/admin/api.js", import.meta.url), "utf8");

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
assert.match(admin, /id="adminTabs"/);
assert.match(admin, /id="out" class="panel-body"/);
assert.match(admin, /id="adminDialog"/);
assert.match(admin, /\.showModal\(\)/);
assert.match(admin, /data-user-check/);
assert.match(admin, /data-user-manage/);
assert.match(admin, /id="bulkManageBtn"/);
assert.match(admin, /id="selectAllUsers"/);
assert.match(admin, /\/admin\/api\/users\/bulk-discipline/);
assert.match(admin, /manageUsers\(usernames\)/);
assert.match(admin, /data-room-action/);
assert.match(admin, /data-replay-view/);
assert.match(admin, /data-replay-download/);
assert.match(admin, /data-report-manage/);
assert.match(admin, /data-risk-manage/);
assert.match(admin, /data-chat-mute/);
assert.match(admin, /data-chat-delete/);
assert.match(admin, /announcementModal/);
assert.doesNotMatch(admin, /\bprompt\s*\(/);
assert.doesNotMatch(admin, /\bconfirm\s*\(/);
assert.doesNotMatch(admin, /\balert\s*\(/);
assert.doesNotMatch(admin, />User ID</);

assert.match(adminApi, /const MAX_BULK_USERS = 20/);
assert.match(adminApi, /cleanBulkNames/);
assert.match(adminApi, /path === "\/admin\/api\/users\/bulk-discipline"/);
assert.match(adminApi, /results\.push\(\{ username: user\.username_display, ok: true \}\)/);
assert.match(adminApi, /action === "confirmed_cheating"/);
assert.match(adminApi, /applyDiscipline\(db, user\.id, action/);
assert.match(adminApi, /resolveUserByName/);
assert.match(adminApi, /resolveChatSubject/);

console.log("feature-policy.test: PASS (ready, login-only voice, bulk modal admin)");
