import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "75b56214219c0703cd4a3540891ad8c2eef52d8a46b885e943cbe44f7608c203";
const expectedSha256 = "d8da127137b9426f0a3d46baec5697ff9abf6aaf3299f8dfc4df88762dc5ce28";

const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) {
  throw new Error(`v0.0.19 worker SHA-256 mismatch: ${actualSourceSha256}`);
}

await import("./sim-v020.mjs");

const output = await readFile(worker);
const actualSha256 = createHash("sha256").update(output).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error(`v0.0.20 worker SHA-256 mismatch: ${actualSha256}`);
}
console.log(`Patched BoardVerse v0.0.20 worker.js (${output.length} bytes, SHA-256 ${actualSha256})`);
