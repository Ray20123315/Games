import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const before = await readFile(worker);
const sourceHash = createHash("sha256").update(before).digest("hex");
const expectedSourceHash = "368863fec9b5abd195b5d0687c8645a962ca300fe74bad3f2791d343ae7209c2";
if (sourceHash !== expectedSourceHash) throw new Error(`v0.0.28 source hash mismatch: ${sourceHash}`);

await import("./sim-v028.mjs");

const after = await readFile(worker);
const outputHash = createHash("sha256").update(after).digest("hex");
const expectedOutputHash = "699312a341dcba152118bc8c66cfc4afba1355d121929f9e91948807eb14e7ab";
if (outputHash !== expectedOutputHash) throw new Error(`v0.0.28 output hash mismatch: ${outputHash}`);
if (after.length !== 262852) throw new Error(`v0.0.28 output size mismatch: ${after.length}`);
console.log(`Patched BoardVerse v0.0.28 worker.js (${after.length} bytes, SHA-256 ${outputHash})`);
