import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wr = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.match(wr, /"name"\s*:\s*"games"/);
assert.match(wr, /"main"\s*:\s*"src\/index-v022\.js"/);
assert.doesNotMatch(wr, /"build"\s*:/);
assert.doesNotMatch(wr, /xn--gmqt6w03b11v\.ray2025\.com\/\*/);
assert.match(wr, /"pattern"\s*:\s*"xn--gmqt6w03b11v\.ray2025\.com"/);
assert.match(wr, /"custom_domain"\s*:\s*true/);
assert.match(wr, /"binding"\s*:\s*"BOARDVERSE_D1"/);
assert.doesNotMatch(wr, /"database_id"\s*:/, "D1 emergency binding must use automatic provisioning");
assert.match(wr, /BOARDVERSE_DB_DO/);
assert.match(wr, /"BOARDVERSE_DB_DO"\s*,\s*"class_name"\s*:\s*"GameRoom"/);
assert.match(wr, /"ROOMS"\s*,\s*"class_name"\s*:\s*"GameRoom"/);
assert.match(wr, /"GameRoom"\s*:\s*\{[^}]*"type"\s*:\s*"durable-object"[^}]*"storage"\s*:\s*"sqlite"/s);
assert.doesNotMatch(wr, /"migrations"\s*:/);
assert.match(wr, /TURNSTILE_SITE_KEY/);
assert.match(wr, /TURNSTILE_HOSTNAMES/);
assert.match(wr, /BOARDVERSE_EMERGENCY_D1/);
assert.match(wr, /BOARDVERSE_EMERGENCY_UNTIL/);

const buildGate = await readFile(new URL("../build-worker.mjs", import.meta.url), "utf8");
assert.match(buildGate, /full regression suite/);
assert.match(buildGate, /Wrangler live-worker dry-run/);
assert.match(buildGate, /targetWorker = "games"/);
assert.match(buildGate, /WRANGLER_CI_OVERRIDE_NAME/);
assert.match(buildGate, /"npm", \["test"\]/);
assert.match(buildGate, /"wrangler",\s*"deploy",\s*"--dry-run"/s);

const v022 = await readFile(new URL("../src/index-v022.js", import.meta.url), "utf8");
for (const x of [
  './index-v021.js','./room/settings-workspace.js','./ui/room-workspace-ui.js','./ui/room-clock-presets.js',
  './ui/room-account-presets.js','./ui/room-rule-selects.js','SETTINGS_RE','/feature/room-settings',
  'await applyRoomSettings','injectRoomWorkspace','injectClockPresetAddon','injectAccountPresetAddon','injectRuleSelectAddon',
]) assert.ok(v022.includes(x), `v022 missing ${x}`);

const v021 = await readFile(new URL("../src/index-v021.js", import.meta.url), "utf8");
for (const x of [
  './index-v020.js','./room/focus-guard-room.js','./emergency/d1-focus-mode.js','FocusGuardGameRoom',
  'pollEmergencyRoomLean','FOCUS_REPORT_RE','boardverse-focus-guard-client','visibilitychange','pagehide','keepalive:true',
]) assert.ok(v021.includes(x), `v021 missing ${x}`);

const v020 = await readFile(new URL("../src/index-v020.js", import.meta.url), "utf8");
for (const x of [
  './index-v019.js','pollEmergencyGlobalLite','boardverseEmergencyNoticeDismissed','今天不再顯示',
  'stripOldNotices','patchHomeNavigation','root-does-not-resume-room','document.visibilityState',
]) assert.ok(v020.includes(x), `v020 missing ${x}`);

const v019 = await readFile(new URL("../src/index-v019.js", import.meta.url), "utf8");
for (const x of [
  './index-v018.js','./emergency/d1-mode.js','emergencyEnabled','BOARDVERSE_D1','EMERGENCY_CLIENT_SCRIPT',
  'EmergencyWebSocket','/api/emergency/rooms/','/api/emergency/global/poll','boardverse-emergency-d1-banner',
]) assert.ok(v019.includes(x), `v019 missing ${x}`);

const v018 = await readFile(new URL("../src/index-v018.js", import.meta.url), "utf8");
assert.match(v018, /from "\.\/index-v017\.js"/);
assert.match(v018, /Exceeded allowed volume of requests in Durable Objects free tier/);
assert.match(v018, /degradedEnv/);

const v017 = await readFile(new URL("../src/index-v017.js", import.meta.url), "utf8");
assert.match(v017, /from "\.\/index-v016\.js"/);
assert.match(v017, /persistRoomChatOnly/);
assert.match(v017, /GLOBAL_POLICY_TTL_MS = 60_000/);
assert.match(v017, /GLOBAL_ARCHIVE_BATCH = 8/);
assert.match(v017, /INSERT OR IGNORE INTO chat_archive/);

const v016 = await readFile(new URL("../src/index-v016.js", import.meta.url), "utf8");
for (const x of ['replayInterruptions','player_disconnected','player_reconnected','boardverse-room-replay-player','bvReplaySpeed','bvReplayThinking','bvReplaySkipDisconnect','boardverse-admin-readable-replay','對局者','公開至']) assert.ok(v016.includes(x), x);

const v015 = await readFile(new URL("../src/index-v015.js", import.meta.url), "utf8");
assert.match(v015, /boardverse-room-replay-scope/);
assert.match(v015, /房內使用者皆可查看/);
assert.match(v015, /boardverse-admin-zh/);

const v014 = await readFile(new URL("../src/index-v014.js", import.meta.url), "utf8");
assert.match(v014, /replay_download_disabled/);
assert.match(v014, /boardverse-unified-modal/);

const v013 = await readFile(new URL("../src/index-v013.js", import.meta.url), "utf8");
assert.match(v013, /from "\.\/index-v012\.js"/);
assert.match(v013, /const OFFLINE_FORFEIT_MS = 20_000/);
assert.match(v013, /member\.offlineDeadline = since \+ OFFLINE_FORFEIT_MS/);
assert.match(v013, /rewriteAuthenticatedRoomName/);
assert.match(v013, /body\.playerName = identity\.name/);
assert.match(v013, /document\.getElementById\('createName'\)/);
assert.match(v013, /document\.getElementById\('gateName'\)/);
assert.match(v013, /離線超過 20 秒/);
assert.doesNotMatch(v013, /ADMIN_PASSWORD|ADMIN_USERNAME/);

const idx = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
for (const x of ['./legacy/runtime-v029.js','scheduled','/replay/','/admin/api/','/ws/global','activateAdminUser','resendVerification']) assert.ok(idx.includes(x), x);

const gr = await readFile(new URL("../src/room/GameRoom.js", import.meta.url), "utf8");
for (const x of ['players_ready','undo_requested','undo_accepted','state_restored','rematch_requested','rematch_accepted','clock_timeout','owner_grace','voice_signal','adminTerminateGame','adminCloseRoom','qiguo','ensureFeatureGameStarted','rematchRequired','assertAccountAllowed','chat_mutes']) assert.ok(gr.includes(x), x);

const ui = await readFile(new URL("../src/ui/enhance.js", import.meta.url), "utf8");
for (const x of ['navigator.share','getUserMedia','STUN_URL','bvGameFilter','bvReady','undo_request','BoardVerseBridge','bvClockPreset','bvCopyLink','bvVoiceLeave','bvRoomPlayerSlow']) assert.ok(ui.includes(x), x);

const replayPage = await readFile(new URL("../src/replay/replay-page.js", import.meta.url), "utf8");
assert.match(replayPage, /function renderIntersectionBoard/);
assert.match(replayPage, /function renderXiangqi/);
assert.match(replayPage, /bK:'將'/);
assert.doesNotMatch(replayPage, /className='cell'/);

const schema = await readFile(new URL("../src/db/schema.js", import.meta.url), "utf8");
for (const t of ['users','user_sessions','replays','replay_events','reports','risk_flags','disciplinary_actions','audit_logs','active_rooms']) assert.ok(schema.includes(`TABLE IF NOT EXISTS ${t}`), t);

const reportSource = await readFile(new URL("../src/reports/reports.js", import.meta.url), "utf8");
assert.match(reportSource, /TURNSTILE_ACTION = "report"/);
assert.match(reportSource, /result\.action !== TURNSTILE_ACTION/);
assert.match(reportSource, /hostnames\.has\(hostname\)/);

console.log("static.test: PASS");
