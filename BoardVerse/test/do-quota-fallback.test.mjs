import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index-v018.js", import.meta.url), "utf8");
const production = await readFile(new URL("../src/index-v023.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(wrangler, /"main"\s*:\s*"src\/index-v023\.js"/);
assert.match(production, /from "\.\/index-v022\.js"/);
assert.match(source, /from "\.\/index-v017\.js"/);
assert.match(source, /Exceeded allowed volume of requests in Durable Objects free tier/);
assert.match(source, /isDoQuotaResponse/);
assert.match(source, /degradedEnv/);
for (const binding of ["BOARDVERSE_DB", "BOARDVERSE_DB_DO", "ROOMS", "GLOBAL_CHAT"]) {
  assert.ok(source.includes(`"${binding}"`), `fallback must suppress ${binding}`);
}
assert.match(source, /boardverse-do-quota-notice/);
assert.match(source, /x-boardverse-degraded/);
assert.match(source, /service_temporarily_limited/);
assert.match(source, /quota.*自動恢復|額度重置後會自動恢復/s);

console.log("do-quota-fallback.test: PASS");
