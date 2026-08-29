import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const i18n = await readFile(new URL("../src/ui/site-i18n.js", import.meta.url), "utf8");
const i18nDict = (await Promise.all(["a","b","c","d"].map((part) => readFile(new URL(`../src/ui/site-i18n-dict-${part}.js`, import.meta.url), "utf8")))).join("\n");
const entry = await readFile(new URL("../src/index-v011.js", import.meta.url), "utf8");
const legacy = await readFile(new URL("../src/legacy/runtime-v029.js", import.meta.url), "utf8").catch(() => "");
const pages = await readFile(new URL("../src/ui/pages.js", import.meta.url), "utf8").catch(() => "");
const adminPages = await readFile(new URL("../src/admin/pages.js", import.meta.url), "utf8").catch(() => "");
const decodedI18n = (i18n + i18nDict).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));

for (const locale of ["zh-Hant", "zh-Hans", "en"]) assert.ok(i18n.includes(locale), `missing shared locale ${locale}`);
assert.match(i18n, /navigator\.languages/);
assert.match(i18n, /navigator\.language/);
assert.match(i18n, /boardverseLang/);
assert.match(i18n, /BoardVerseI18n/);
assert.match(i18n, /bvGlobalLang/);
assert.match(decodedI18n, /繁體中文/);
assert.match(decodedI18n, /简体中文/);
assert.match(i18n, /English/);
assert.match(decodedI18n, /BoardVerse 管理後台/);
assert.match(i18nDict, /BoardVerse Admin Console/);
assert.match(decodedI18n, /下載離線回放/);
assert.match(i18nDict, /Download offline replay/);
assert.match(entry, /SITE_I18N_SCRIPT/);
assert.match(entry, /injectSiteScripts/);
assert.doesNotMatch(entry, /function injectSiteI18n/);
assert.match(entry, /boardverse-site-i18n/);
if (legacy) {
  assert.match(legacy, /id="languageSelect"/);
  assert.match(legacy, /zhHant:/);
  assert.match(legacy, /zhHans:/);
  assert.match(legacy, /en:/);
}
if (pages) {
  assert.match(pages, /data-bv-h/);
  assert.match(pages, /data-bv-s/);
  assert.match(pages, /data-bv-e/);
}
if (adminPages) {
  assert.match(adminPages, /boardverseLang/);
  assert.match(adminPages, /'帳號等級','账号等级','Account level'/);
  assert.match(adminPages, /'全域設定','全局设置','Global settings'/);
  assert.match(adminPages, /'稽核記錄','审计记录','Audit log'/);
}
console.log("i18n.test: PASS (zh-Hant, zh-Hans, en)");
