import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index-v013.js", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("host kick panel is relocated into the scrollable room sidebar", () => {
  assert.match(source, /document\.querySelector\('\.side-stack'\)/);
  assert.match(source, /side\.insertBefore\(panel,side\.firstChild\)/);
  assert.match(source, /bv-host-kick-card/);
});

test("relocation follows dynamically rendered owner feature state", () => {
  assert.match(source, /MutationObserver\(relocate\)/);
  assert.match(source, /boardverse:feature/);
});

test("deployment entry points at v013 compatibility layer", () => {
  assert.match(wrangler, /"main": "src\/index-v013\.js"/);
});
