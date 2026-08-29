import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RESPONSIVE_STYLE, SITE_I18N_SCRIPT } from "../src/ui/site-i18n.js";

assert.match(RESPONSIVE_STYLE, /id="boardverse-responsive"/);
assert.match(RESPONSIVE_STYLE, /@media \(max-width:1024px\)/);
assert.match(RESPONSIVE_STYLE, /@media \(max-width:720px\)/);
assert.match(RESPONSIVE_STYLE, /@media \(pointer:coarse\)/);
assert.match(RESPONSIVE_STYLE, /safe-area-inset-left/);
assert.match(RESPONSIVE_STYLE, /100dvh/);
assert.match(RESPONSIVE_STYLE, /\.room-layout\{[^}]*grid-template-columns:minmax\(0,1fr\)/s);
assert.match(RESPONSIVE_STYLE, /\.board-stage\{[^}]*70dvh/s);
assert.match(RESPONSIVE_STYLE, /\.admin-frame\{[^}]*min-width:0!important/s);
assert.match(RESPONSIVE_STYLE, /\.admin-frame \.summary\{[^}]*repeat\(2,minmax\(0,1fr\)\)/s);
assert.match(RESPONSIVE_STYLE, /#bvPublicNav\{[^}]*position:static!important/s);
assert.ok(SITE_I18N_SCRIPT.indexOf('id="boardverse-responsive"') < SITE_I18N_SCRIPT.indexOf('id="boardverse-site-i18n"'));

const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");
assert.match(entry, /SITE_I18N_SCRIPT/);
assert.match(entry, /injectSiteScripts/);
console.log("responsive.test: PASS");
