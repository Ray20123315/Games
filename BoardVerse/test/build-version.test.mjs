import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const build = await readFile(new URL("../build-worker.mjs", import.meta.url), "utf8");

assert.match(build, /readFileSync\(new URL\("\.\/package\.json", import\.meta\.url\)/);
assert.match(build, /const appVersion = String\(packageMeta\.version \|\| "unknown"\)/);
assert.match(build, /validating BoardVerse v\$\{appVersion\}/);
assert.doesNotMatch(build, /validating BoardVerse v0\.1\.1/);
assert.equal(pkg.version, "0.1.2");

console.log(`build-version.test: PASS (BoardVerse v${pkg.version})`);
