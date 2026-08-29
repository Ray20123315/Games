import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const wr=await readFile(new URL("../wrangler.jsonc",import.meta.url),"utf8");
assert.match(wr,/"main"\s*:\s*"src\/index-v011\.js"/);
assert.doesNotMatch(wr,/"build"\s*:/);
assert.match(wr,/GLOBAL_CHAT/);
assert.match(wr,/0 16 \* \* \*/);
assert.match(wr,/BOARDVERSE_DB_DO/);
assert.match(wr,/BoardVerseDb/);
assert.match(wr,/new_sqlite_classes/);
assert.doesNotMatch(wr,/"database_id"\s*:\s*"(?:00000000|placeholder|example)/i,"fake D1 UUID must never be committed");
const entry=await readFile(new URL("../src/index-v011.js",import.meta.url),"utf8"); assert.match(entry,/from "\.\/index\.js"/); assert.match(entry,/\.\/ui\/piece-theme\.js/); assert.match(entry,/hardenPieceThemeHtml/); assert.match(entry,/withDatabaseEnv/); assert.match(entry,/BoardVerseDb/);
const pieceTheme=await readFile(new URL("../src/ui/piece-theme.js",import.meta.url),"utf8"); assert.match(pieceTheme,/color-scheme:only light/); assert.match(pieceTheme,/forced-color-adjust:none/); assert.match(pieceTheme,/background-color:#f4f6f8!important/); assert.match(pieceTheme,/-webkit-text-fill-color:#faf7ee!important/);
const idx=await readFile(new URL("../src/index.js",import.meta.url),"utf8"); assert.match(idx,/\.\/legacy\/runtime-v029\.js/); assert.match(idx,/scheduled/); assert.match(idx,/\/replay\//); assert.match(idx,/\/admin\/api\//); assert.match(idx,/\/ws\/global/);
const gr=await readFile(new URL("../src/room/GameRoom.js",import.meta.url),"utf8"); for(const x of ["players_ready","undo_requested","undo_accepted","state_restored","rematch_requested","rematch_accepted","clock_timeout","owner_grace","voice_signal","adminTerminateGame","adminCloseRoom","qiguo","ensureFeatureGameStarted","rematchRequired"]) assert.ok(gr.includes(x),x);
const ui=await readFile(new URL("../src/ui/enhance.js",import.meta.url),"utf8"); for(const x of ["navigator.share","getUserMedia","STUN_URL","bvGameFilter","bvReady","undo_request","BoardVerseBridge"]) assert.ok(ui.includes(x),x);
assert.match(ui,/APP_VERSION/); assert.match(ui,/v0\.0\.29<\/span>/);
const schema=await readFile(new URL("../src/db/schema.js",import.meta.url),"utf8"); for(const t of ["users","user_sessions","replays","replay_events","reports","risk_flags","disciplinary_actions","audit_logs","active_rooms"]) assert.ok(schema.includes(`TABLE IF NOT EXISTS ${t}`),t);

assert.match(idx,/activateAdminUser/,"activation route should be wired");
assert.match(idx,/resendVerification/,"resend verification should use exported service");
assert.match(gr,/assertAccountAllowed/,"privileged room actions must recheck account status");
assert.match(gr,/chat_mutes/,"room chat mute enforcement must be server-side");
assert.match(ui,/bvClockPreset/,"clock preset UI missing");
assert.match(ui,/bvCopyLink/,"Copy link control missing");
assert.match(ui,/row\.hidden=!show/,"game filter must compose with existing text search");
assert.match(ui,/bvVoiceLeave/,"voice leave UI missing");
assert.match(ui,/bvRoomPlayerSlow/,"room slow-mode UI missing");
const replayPage=await readFile(new URL("../src/replay/replay-page.js",import.meta.url),"utf8");
assert.match(replayPage,/pieceText\(p,g\.type\)/,"replay renderer must distinguish game piece alphabets");
assert.match(replayPage,/bK:'將'/,"Xiangqi black king must render as 將");

const cfg=await readFile(new URL("../src/core/config.js",import.meta.url),"utf8"); assert.ok(cfg.includes("stun:stun.cloudflare.com:3478"));

for(const game of ["xiangqi_random","banqi","qiguo"]) assert.ok(cfg.includes(`"${game}"`), game);
assert.match(gr,/room\.seats\?\.length === 2/); assert.match(gr,/七國象棋.*暫不提供.*悔棋/);

assert.match(wr,/TURNSTILE_SITE_KEY/);
assert.match(wr,/TURNSTILE_HOSTNAMES/);
const reportSource=await readFile(new URL("../src/reports/reports.js",import.meta.url),"utf8");
assert.match(reportSource,/TURNSTILE_ACTION = "report"/);
assert.match(reportSource,/result\.action !== TURNSTILE_ACTION/);
assert.match(reportSource,/hostnames\.has\(hostname\)/);
const pages=await readFile(new URL("../src/ui/pages.js",import.meta.url),"utf8");
assert.match(pages,/data-action="report"/);
console.log("static.test: PASS");