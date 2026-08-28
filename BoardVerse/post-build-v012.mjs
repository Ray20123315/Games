import fs from "node:fs";
import crypto from "node:crypto";

const workerPath = new URL("./worker.js", import.meta.url);
const EXPECTED_SOURCE_SHA256 = "541ff63d982204bdc27256ed3f7f7788dd5a412551923c5476cea05645a19aa3";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one patch marker, found ${count}`);
  return source.replace(from, to);
}

let source = fs.readFileSync(workerPath, "utf8");
const sourceSha = sha256(source);
if (sourceSha !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`v0.0.12 source SHA mismatch: expected ${EXPECTED_SOURCE_SHA256}, got ${sourceSha}`);
}

source = replaceOnce(
  source,
  'const APP_VERSION = "0.0.11";',
  'const APP_VERSION = "0.0.12";',
  "app version",
);

source = replaceOnce(
  source,
  '      else if (msg.type === "pass") await this.handleMove(token, { type: "move", action: "pass" });',
  `      else if (msg.type === "pass") {
        if (!["go9","go13","go19"].includes(this.room?.gameId)) throw new Error("此棋類不支援虛手。");
        await this.handleMove(token, { type: "move", action: "pass" });
      }`,
  "server pass guard",
);

source = replaceOnce(
  source,
  `  async resign(token) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");
    if (!auth || auth.member.role !== "player") throw new Error("你目前沒有玩家席位。");
    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== auth.member.id);
    await this.finishMatch({ winner: opponent?.side || null, reason: auth.member.name + " 認輸" });
  }`,
  `  async resign(token) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");
    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");
    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== auth.member.id);
    if (!opponent) throw new Error("找不到對手，無法完成認輸。");
    await this.finishMatch({
      winner: opponent.side || null,
      winnerMemberId: opponent.id,
      winnerName: opponent.name,
      loserMemberId: auth.member.id,
      loserName: auth.member.name,
      reason: auth.member.name + " 認輸",
    });
  }`,
  "authoritative resign result",
);

source = replaceOnce(
  source,
  `  if (wins) {
    next.ended = true; next.winner = side;
    return { game: next, ended: true, result: { winner: side, reason: target === 6 ? "形成六連" : (rules.variant === "exact5" ? "形成精確五連" : "形成五連") } };
  }
  if (game.type === "gomoku" && rules.opening === "swap" && game.moveNumber === 0) next.swapAvailable = true;`,
  `  if (wins) {
    next.ended = true; next.winner = side;
    return { game: next, ended: true, result: { winner: side, reason: target === 6 ? "形成六連" : (rules.variant === "exact5" ? "形成精確五連" : "形成五連") } };
  }
  if (!next.board.some((cell) => cell == null)) {
    next.ended = true; next.winner = null;
    return { game: next, ended: true, result: { winner: null, reason: "棋盤已滿，和棋" } };
  }
  if (game.type === "gomoku" && rules.opening === "swap" && game.moveNumber === 0) next.swapAvailable = true;`,
  "gomoku and renju full-board draw",
);

source = replaceOnce(
  source,
  '  return { type: "chess", board: b, turn: "W", moveNumber: 0, ended: false, lastMove: null, castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null, rules, checks:{W:0,B:0}, halfmoveClock:0, positionHistory:[] };',
  `  const game = { type: "chess", board: b, turn: "W", moveNumber: 0, ended: false, lastMove: null, castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null, rules, checks:{W:0,B:0}, halfmoveClock:0, positionHistory:[] };
  game.positionHistory = [chessPositionKey(game)];
  return game;`,
  "chess initial repetition position",
);

fs.writeFileSync(workerPath, source);
console.log(`BoardVerse v0.0.12 patch complete. worker.js sha256=${sha256(source)}`);
