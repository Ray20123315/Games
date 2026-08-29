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
assert.match(admin, /overflow-x:auto/);
assert.match(admin, /id="adminTabs"/);
assert.match(admin, /id="out" class="panel-body"/);
assert.match(admin, /\['users','使用者','用户','Users'\]/);
assert.match(admin, /\['rooms','房間','房间','Rooms'\]/);
assert.match(admin, /\['replays','回放','回放','Replays'\]/);
assert.match(admin, /\['reports','檢舉','举报','Reports'\]/);
assert.match(admin, /\['risk','風險旗標','风险标记','Risk flags'\]/);
assert.doesNotMatch(admin, /\['roomActions'/);
assert.doesNotMatch(admin, /\['replayTools'/);
assert.doesNotMatch(admin, /\['level'/);
assert.doesNotMatch(admin, /\['discipline'/);
assert.match(admin, /data-room-action/);
assert.match(admin, /data-replay-view/);
assert.match(admin, /data-replay-download/);
assert.match(admin, /data-report=/);
assert.match(admin, /data-risk=/);
assert.match(admin, /username:document\.getElementById\('userName'\)/);
assert.match(admin, /players\(r\.players_json\)/);
assert.match(admin, /replayResult\(r\.result_json\)/);
assert.match(admin, /function num\(i\)/);
assert.doesNotMatch(admin, />User ID</);
assert.match(adminApi, /resolveUserByName/);
assert.match(adminApi, /b\.username \|\| b\.user \|\| b\.userId/);
assert.match(adminApi, /resolveChatSubject/);
assert.match(adminApi, /guest_name_ambiguous/);

console.log("feature-policy.test: PASS (ready, login-only voice, simplified name-based admin)");
