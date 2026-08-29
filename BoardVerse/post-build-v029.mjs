import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const before = await readFile(worker);
const sourceHash = createHash("sha256").update(before).digest("hex");
const expectedSourceHash = "699312a341dcba152118bc8c66cfc4afba1355d121929f9e91948807eb14e7ab";
if (sourceHash !== expectedSourceHash) throw new Error(`v0.0.29 source hash mismatch: ${sourceHash}`);

await import("./sim-v029.mjs");

const after = await readFile(worker);
const outputHash = createHash("sha256").update(after).digest("hex");
const expectedOutputHash = "650d3f3e2931dc6ac214f0bbb3cea093ef6693b66e18ec020650e98ad35f043a";
if (outputHash !== expectedOutputHash) throw new Error(`v0.0.29 output hash mismatch: ${outputHash}`);
console.log(`Patched BoardVerse v0.0.29 worker.js (${after.length} bytes, SHA-256 ${outputHash})`);
