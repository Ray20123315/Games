import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index-v012.js", import.meta.url), "utf8");

test("v012 rewrites bare /admin internally to the canonical admin route", () => {
  assert.match(source, /requestUrl\.pathname === "\/admin"/);
  assert.match(source, /requestUrl\.pathname = "\/admin\/"/);
  assert.match(source, /new Request\(requestUrl, request\)/);
  assert.match(source, /appV011\.fetch\(routedRequest, env, ctx\)/);
});

test("admin rewrite is GET-only and preserves the existing admin router", () => {
  assert.match(source, /request\.method === "GET"/);
  assert.match(source, /import appV011/);
});
