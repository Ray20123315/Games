import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { injectAdminLevelPanel } from "../src/admin/level-ui.js";

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
assert.match(entry, /injectAdminLevelPanel/);

assert.match(policy, /id="boardverse-feature-policy"/);
assert.match(entry, /\/api\/voice-entitlement/);
assert.match(policy, /\/api\/voice-entitlement/);
assert.match(policy, /bvVoiceLoginHint/);
assert.match(policy, /voiceLoginRequired/);
assert.match(policy, /bvAdminLevelCard/);
assert.match(policy, /action:'level_set'/);
for (let level=1;level<=5;level++) assert.match(policy, new RegExp(`Lv\\.${level}`));

const sample = '<body><div class="grid"><div class="card"><h3>帳號處分</h3></div><div class="card"><h3>回報／Risk 審查</h3></div></div></body>';
const injected = injectAdminLevelPanel(sample, "/admin/");
assert.match(injected, /id="bvAdminLevelCard"/);
assert.match(injected, /id="bvLevelUser"/);
assert.match(injected, /id="bvLevelValue"/);
assert.match(injected, /id="bvLevelReason"/);
assert.match(injected, /id="bvLevelSave"/);
assert.match(injected, /action:'level_set'/);
for (let level=1;level<=5;level++) assert.match(injected, new RegExp(`Lv\\.${level}`));
assert.equal(injectAdminLevelPanel(injected, "/admin/"), injected);
assert.equal(injectAdminLevelPanel(sample, "/"), sample);

console.log("feature-policy.test: PASS (ready toggle, login-only voice, visible admin level panel)");
