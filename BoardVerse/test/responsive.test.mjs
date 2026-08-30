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

const mobileFix = await readFile(new URL("../src/index-v020.js", import.meta.url), "utf8");
assert.match(mobileFix, /id="boardverse-mobile-room-layout-fix"/);
assert.match(mobileFix, /body\.room-mode \.board-stage\{height:auto!important;min-height:0!important;max-height:none!important/);
assert.match(mobileFix, /body\.room-mode \.board-card\{flex:0 0 auto!important/);
assert.match(mobileFix, /body\.room-mode \.banqi-board\{aspect-ratio:2\/1!important/);
assert.match(mobileFix, /body\.room-mode \.banqi-board \.sq\{aspect-ratio:auto!important/);
assert.match(mobileFix, /safe-area-inset-bottom/);
assert.match(mobileFix, /overflow-wrap:anywhere!important/);
assert.match(mobileFix, /x-boardverse-mobile-room-layout/);

console.log("responsive.test: PASS");
