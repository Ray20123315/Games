import { readdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const sourceDir = new URL("./.source/", import.meta.url);
const output = new URL("./worker.js", import.meta.url);
const expectedSha256 = "b598525c198309a7f1decca80e4c9fc1b400c35408bd1350aa11f59aec48bbf5";

const files = (await readdir(sourceDir))
  .filter((name) => /^worker\.js\.gz\.b64\.\d{3}$/.test(name))
  .sort();

if (!files.length) throw new Error("BoardVerse source chunks not found.");
const base64 = (await Promise.all(files.map((name) => readFile(new URL(name, sourceDir), "utf8")))).join("");
const source = gunzipSync(Buffer.from(base64, "base64"));
const actualSha256 = createHash("sha256").update(source).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`worker.js SHA-256 mismatch: ${actualSha256}`);
await writeFile(output, source);
console.log(`Built worker.js (${source.length} bytes, SHA-256 ${actualSha256})`);
