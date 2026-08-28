import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "541ff63d982204bdc27256ed3f7f7788dd5a412551923c5476cea05645a19aa3";
const expectedSha256 = "2d60c0f3379c3837f555c63e9b4b2dc87ffc3d245e66adc43cb8a79d6a04b691";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.11 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.11";', 'const APP_VERSION = "0.0.12";', "version");

replaceExact(
  '  if (wins) {\n    next.ended = true; next.winner = side;\n    return { game: next, ended: true, result: { winner: side, reason: target === 6 ? "形成六連" : (rules.variant === "exact5" ? "形成精確五連" : "形成五連") } };\n  }\n  if (game.type === "gomoku" && rules.opening === "swap" && game.moveNumber === 0) next.swapAvailable = true;',
  '  if (wins) {\n    next.ended = true; next.winner = side;\n    return { game: next, ended: true, result: { winner: side, reason: target === 6 ? "形成六連" : (rules.variant === "exact5" ? "形成精確五連" : "形成五連") } };\n  }\n  if (next.board.every((cell) => cell != null)) {\n    next.ended = true; next.winner = null;\n    return { game: next, ended: true, result: { winner: null, reason: "棋盤已滿且無勝線，和棋" } };\n  }\n  if (game.type === "gomoku" && rules.opening === "swap" && game.moveNumber === 0) next.swapAvailable = true;',
  "gomoku/renju full-board draw"
);

replaceExact(
  '    if (!auth || auth.member.role !== "player") throw new Error("你目前沒有玩家席位。");\n    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== auth.member.id);',
  '    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\n    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== auth.member.id);',
  "resign seated-player guard"
);

replaceExact(
  '  async finishMatch(result) {\n    const room = this.room;\n    const publicResult = this.publicResult(result);',
  '  async finishMatch(result) {\n    const room = this.room;\n    if (!room || room.status !== "playing") return;\n    const publicResult = this.publicResult(result);\n    if (room.game) { room.game.ended = true; if ("winner" in room.game) room.game.winner = publicResult.winner; }',
  "finish-match idempotency and game terminal state"
);

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.12 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.12 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
