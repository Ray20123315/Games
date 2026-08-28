import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "2d60c0f3379c3837f555c63e9b4b2dc87ffc3d245e66adc43cb8a79d6a04b691";
const expectedSha256 = "5e86536425ca0749ef970a442e8307245bf5149f37ded06e144c10cc509c3dea";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.12 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.12";', 'const APP_VERSION = "0.0.13";', "version");

replaceExact(
  '.stone.black{background:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%);box-shadow:0 3px 7px rgba(0,0,0,.48),inset 0 0 0 1px #5d646a}.stone.white{background:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%);box-shadow:0 3px 7px rgba(0,0,0,.42),inset 0 0 0 1px #727b84}',
  '.stone.black{background-color:#050607;background-image:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%);box-shadow:0 3px 7px rgba(0,0,0,.48),inset 0 0 0 1px #5d646a}.stone.white{background-color:#f4f6f8;background-image:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%);box-shadow:0 3px 7px rgba(0,0,0,.42),inset 0 0 0 2px #606a74}',
  "stone color fallback"
);

replaceExact(
  "function chessPiece(p){var m={wK:'♚',wQ:'♛',wR:'♜',wB:'♝',wN:'♞',wP:'♟',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'},s=document.createElement('span');",
  "function chessPiece(p){var m={wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'},s=document.createElement('span');",
  "chess glyph mapping"
);

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.13 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.13 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
