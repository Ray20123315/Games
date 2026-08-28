import { readdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const sourceDir = new URL("./.source-v005/", import.meta.url);
const output = new URL("./worker.js", import.meta.url);
const sourceSha256 = "fb0b4485498e2be629258d4f43bcda8ee5a335d4ea3723ad0f3d964468ab3fad";
const expectedSha256 = "d7d61731210ef504c39e98d7c406d5079a19905d66c5e39c5f5ff8c10a525568";
const files = (await readdir(sourceDir)).filter((name) => /^v005\.worker\.js\.gz\.b64\.\d{3}$/.test(name)).sort();
if (!files.length) throw new Error("BoardVerse v0.0.5 source chunks not found.");
const base64 = (await Promise.all(files.map((name) => readFile(new URL(name, sourceDir), "utf8")))).join("");
const sourceBuffer = gunzipSync(Buffer.from(base64, "base64"));
const actualSourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.5 source SHA-256 mismatch: ${actualSourceSha256}`);

let source = sourceBuffer.toString("utf8");
const versionNeedle = 'const APP_VERSION = "0.0.5";';
const pbkdfNeedle = "iterations: 120000,";
if (!source.includes(versionNeedle)) throw new Error("v0.0.5 version marker not found.");
if (!source.includes(pbkdfNeedle)) throw new Error("v0.0.5 PBKDF2 marker not found.");
source = source.replace(versionNeedle, 'const APP_VERSION = "0.0.6";');
source = source.replace(pbkdfNeedle, "iterations: 100000,");

const outputBuffer = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(outputBuffer).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`worker.js SHA-256 mismatch: ${actualSha256}`);
await writeFile(output, outputBuffer);
console.log(`Built BoardVerse v0.0.6 worker.js (${outputBuffer.length} bytes, SHA-256 ${actualSha256})`);
