import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const before = await readFile(worker);
const sourceHash = createHash("sha256").update(before).digest("hex");
const expectedSourceHash = "99034cdba2d1b72473ef50fc5ad0b190f007cb4638d40dddd7ce8959a9606fd0";
if (sourceHash !== expectedSourceHash) throw new Error(`v0.0.27 source hash mismatch: ${sourceHash}`);

await import("./sim-v027.mjs");

const after = await readFile(worker);
const outputHash = createHash("sha256").update(after).digest("hex");
const expectedOutputHash = "368863fec9b5abd195b5d0687c8645a962ca300fe74bad3f2791d343ae7209c2";
if (outputHash !== expectedOutputHash) throw new Error(`v0.0.27 output hash mismatch: ${outputHash}`);
console.log(`Patched BoardVerse v0.0.27 worker.js (${after.length} bytes, SHA-256 ${outputHash})`);
