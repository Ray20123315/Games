import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");
const policy = await readFile(new URL("../src/ui/feature-policy.js", import.meta.url), "utf8");

assert.match(entry, /feature\.canReady = feature\.myRole === "player" && feature\.status === "waiting"/);
assert.doesNotMatch(entry, /feature\.canReady[^\n]*allSeatsFilled/);
assert.match(entry, /feature\.canVoice = !!feature\.canVoice && !!feature\.myUserId/);
assert.match(entry, /voiceLoginRequired/);
assert.match(entry, /async voiceSignal\(member, msg\)/);
assert.match(entry, /voice_login_required/);
assert.match(entry, /pathname === "\/api\/rooms"/);
assert.match(entry, /\/api\\\/rooms\\\/\(\[A-Z2-9\]\{6\}\)/);
assert.match(entry, /boardverse\.internal\/info/);
assert.match(entry, /FEATURE_POLICY_SCRIPT/);

assert.match(policy, /id="boardverse-feature-policy"/);
assert.match(entry, /\/api\/voice-entitlement/);
assert.match(policy, /\/api\/voice-entitlement/);
assert.match(policy, /bvVoiceLoginHint/);
assert.match(policy, /voiceLoginRequired/);
assert.match(policy, /bvAdminLevelCard/);
assert.match(policy, /action:'level_set'/);
for (let level=1;level<=5;level++) assert.match(policy, new RegExp(`Lv\\.${level}`));

console.log("feature-policy.test: PASS (ready toggle, login-only voice, admin level)");
