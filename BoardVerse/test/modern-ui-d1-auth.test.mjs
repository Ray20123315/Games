import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const ui = await readFile(new URL("../src/ui/modern-ui.js", import.meta.url), "utf8");
const urgent = await readFile(new URL("../src/ui/urgent-v023.js", import.meta.url), "utf8");
const authRoomUi = await readFile(new URL("../src/ui/authenticated-room-fields.js", import.meta.url), "utf8");
const liveUi = await readFile(new URL("../src/ui/room-live-fixes.js", import.meta.url), "utf8");
const legacy = await readFile(new URL("../src/legacy/runtime-v029.js", import.meta.url), "utf8");
const v020 = await readFile(new URL("../src/index-v020.js", import.meta.url), "utf8");
const v022 = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
const v023 = await readFile(new URL("../src/index-v023.js", import.meta.url), "utf8");
const identity = await readFile(new URL("../src/emergency/d1-identity.js", import.meta.url), "utf8");
const edge = await readFile(new URL("../src/edge-proxy.js", import.meta.url), "utf8");
const origin = await readFile(new URL("../src/origin-v022.js", import.meta.url), "utf8");
const originConfig = await readFile(new URL("../wrangler.origin.example.jsonc", import.meta.url), "utf8");
const edgeConfig = await readFile(new URL("../wrangler.edge.example.jsonc", import.meta.url), "utf8");
const production = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

for (const marker of [
  'page-theme-scifi','boardverseThemeV2','bvThemeSciFi','input[type="checkbox"]','appearance:none',
  'bv-room-action-strip','bvCopyLink','bvFocusGuardButton','#ruleInfo','bv-level-1','bv-level-2','bv-level-3','bv-level-4','bv-level-5',
  'bvAdminReflect','bvOwnerReflect','bvTitleReflect','bv-id-title','bv-room-id-title',
]) assert.ok(ui.includes(marker), `modern UI missing ${marker}`);
assert.match(ui, /#55fff1/);
assert.match(ui, /#fff2a2/);
assert.match(ui, /#c497ff/);
assert.match(ui, /themeValue\(\).*scifi/s);

for (const marker of [
  'appV018','emergencyAccountEnv','BOARDVERSE_DB','BOARDVERSE_D1','isEmergencyAccountPath',
  'sessionUser','getUserMembership','publicIdentityForUser','attachEmergencyRoomIdentity','injectModernUi',
  'ADMIN 可直接使用原本管理憑證登入',
]) assert.ok(v020.includes(marker), `v020 D1 auth/UI missing ${marker}`);
assert.match(v020, /if \(key === "BOARDVERSE_DB"\) return target\.BOARDVERSE_D1/);
assert.match(v020, /if \(key === "BOARDVERSE_DB_DO"\) return undefined/);
assert.match(v020, /pathname\.startsWith\("\/admin\/"\)/);

for (const marker of ['bvAuthErrorOverlay','bvAuthErrorDialog','bvAuthErrorMessage','AUTH_FORM_RE','hookAuthForms','showAuthError','new FormData(form)']) {
  assert.ok(urgent.includes(marker), `v023 custom auth error modal missing ${marker}`);
}
assert.match(urgent, /\/\(\?:login\|register\|resend-verification\|forgot\|reset\|activate\)/);
assert.doesNotMatch(urgent, /window\.alert\(/, 'v023 auth error handling must not fall back to native alert');

for (const marker of [
  'boardverse-authenticated-room-fields','bv-authenticated-room-password-field','/api/me',
  'createPassword','gatePassword','createName','gateName','role!==\'guest\'',
  "input.disabled=true","input.readOnly=true",
]) assert.ok(authRoomUi.includes(marker), `authenticated room UI missing ${marker}`);
assert.doesNotMatch(authRoomUi, /window\.alert\(/, 'authenticated room field handling must not use native alerts');

for (const marker of [
  'boardverse-room-live-fixes','bvClockRow','bvRoomMetaControls','feature.clock',"c.mode!=='untimed'",
  'openingText','openingActions',"actions.querySelector('button')",'取得選色權，等待該玩家選擇持色。',
  '取得选色权，等待该玩家选择持色。','waiting for that player to choose a color',
]) assert.ok(liveUi.includes(marker), `live room UI fix missing ${marker}`);
assert.doesNotMatch(liveUi, /B: 0:00|W: 0:00/, 'live UI fix must not hard-code zero clocks');

for (const marker of [
  'injectAuthenticatedRoomFields','injectRoomLiveFixes','authenticatedRoomIdentity','resolveAuthenticatedRoomSession',
  '/feature/authenticated-room-session','sessionUser','adminPlayerEntitlement','ensureDbSchema',
  'body.returnPassword = ""','body.sessionToken = existing.token','memberForUser',
  'if (!identity) return request',
]) assert.ok(v023.includes(marker), `v023 authenticated/live room flow missing ${marker}`);
assert.match(v023, /await ensureDbSchema\(db\)/);
assert.match(v023, /SELECT room_json FROM emergency_rooms WHERE room_id=\? AND expires_at>\?/);
assert.match(v023, /return json\(\{ ok: true, token: String\(member\.token\), name: String\(member\.name \|\| ""\) \}\)/);

for (const marker of ['returnPassword','verifyPasswordRecord','existing.passwordHash','sessionToken && sessionToken === existing.token']) {
  assert.ok(legacy.includes(marker), `guest return-password/session fallback missing ${marker}`);
}
assert.match(legacy, /if \(!allowed && existing\.passwordHash\) allowed = await verifyPasswordRecord\(existing, password\)/);
assert.match(legacy, /取得選色權，請選擇持色。/, 'legacy chooser prompt remains the source prompt and is viewer-corrected by the v023 live UI layer');

for (const marker of ['memberIdentities','memberUsers','revision=revision+1','issueEmergencyChatIdentity','postAuthenticatedEmergencyGlobal','signPayload','verifySignedPayload']) {
  assert.ok(identity.includes(marker), `emergency identity missing ${marker}`);
}

for (const marker of ['BOARDVERSE_ORIGIN_URL','x-boardverse-original-origin','x-boardverse-edge-secret','fetch(withHeaders)']) {
  assert.ok(edge.includes(marker), `edge proxy missing ${marker}`);
}
for (const marker of ['index-v021.js','BOARDVERSE_EDGE_SHARED_SECRET','x-boardverse-original-origin','new Request(forwarded, { headers })']) {
  assert.ok(origin.includes(marker), `origin wrapper missing ${marker}`);
}
assert.match(originConfig, /"binding"\s*:\s*"BOARDVERSE_DB"/);
assert.match(originConfig, /"GLOBAL_CHAT"\s*,\s*"class_name"\s*:\s*"GlobalChat"/);
assert.match(originConfig, /REPLACE_WITH_NEW_ACCOUNT_D1_DATABASE_ID/);
assert.match(edgeConfig, /xn--gmqt6w03b11v\.ray2025\.com/);
assert.match(edgeConfig, /REPLACE_WITH_NEW_ACCOUNT_SUBDOMAIN/);
assert.match(production, /"main"\s*:\s*"src\/index-v024\.js"/);
assert.match(v023, /from "\.\/index-v022\.js"/);
assert.match(v022, /from "\.\/index-v021\.js"/);
assert.match(production, /"database_name"\s*:\s*"games-boardverse-recovery-20260830-v2"/);

const scriptStart = ui.indexOf('const MODERN_UI_SCRIPT = String.raw`<script');
assert.ok(scriptStart >= 0, "modern UI inline script missing");
const bodyStart = ui.indexOf('>', scriptStart) + 1;
const bodyEnd = ui.indexOf('</script>`;', bodyStart);
assert.ok(bodyStart > scriptStart && bodyEnd > bodyStart, "modern UI inline script boundary invalid");
new vm.Script(ui.slice(bodyStart, bodyEnd), { filename: "modern-ui.js" });

const urgentScriptStart = urgent.indexOf('const SCRIPT = String.raw`<script');
assert.ok(urgentScriptStart >= 0, "urgent v023 inline script missing");
const urgentBodyStart = urgent.indexOf('>', urgentScriptStart) + 1;
const urgentBodyEnd = urgent.indexOf('</script>`;', urgentBodyStart);
assert.ok(urgentBodyStart > urgentScriptStart && urgentBodyEnd > urgentBodyStart, "urgent v023 script boundary invalid");
new vm.Script(urgent.slice(urgentBodyStart, urgentBodyEnd), { filename: "urgent-v023.js" });

const authScriptStart = authRoomUi.indexOf('<script id="boardverse-authenticated-room-fields">');
assert.ok(authScriptStart >= 0, "authenticated room fields inline script missing");
const authBodyStart = authRoomUi.indexOf('>', authScriptStart) + 1;
const authBodyEnd = authRoomUi.indexOf('</script>`;', authBodyStart);
assert.ok(authBodyStart > authScriptStart && authBodyEnd > authBodyStart, "authenticated room fields script boundary invalid");
new vm.Script(authRoomUi.slice(authBodyStart, authBodyEnd), { filename: "authenticated-room-fields.js" });

const liveScriptStart = liveUi.indexOf('export const ROOM_LIVE_FIXES_SCRIPT = String.raw`<script');
assert.ok(liveScriptStart >= 0, "room live fixes inline script missing");
const liveBodyStart = liveUi.indexOf('>', liveScriptStart) + 1;
const liveBodyEnd = liveUi.indexOf('</script>`;', liveBodyStart);
assert.ok(liveBodyStart > liveScriptStart && liveBodyEnd > liveBodyStart, "room live fixes script boundary invalid");
new vm.Script(liveUi.slice(liveBodyStart, liveBodyEnd), { filename: "room-live-fixes.js" });

console.log("modern-ui-d1-auth.test: PASS");
