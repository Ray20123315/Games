import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "75b56214219c0703cd4a3540891ad8c2eef52d8a46b885e943cbe44f7608c203";
const expectedSha256 = "b153db101988e5cd1d1381ff4e4dde2e6caa54036556fb9dc470eded10e7f53a";

const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) {
  throw new Error(`v0.0.19 worker SHA-256 mismatch: ${actualSourceSha256}`);
}

await import("./sim-v020.mjs");

let source = await readFile(worker, "utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.replace(from, to);
}

const languageSelect = '<select id="languageSelect" class="compact-select" aria-label="Language"><option value="zh-Hant">繁體</option><option value="zh-Hans">简体</option><option value="en">English</option></select>';
const themeControl = '<div class="board-bg-setting theme-setting"><span id="pageBgLabel">頁面背景</span><div id="pageThemeChoice" class="theme-choice" role="radiogroup" aria-label="頁面背景"><button id="pageBgBlack" class="theme-option" type="button" role="radio" aria-checked="true">黑</button><button id="pageBgWhite" class="theme-option" type="button" role="radio" aria-checked="false">白</button></div></div>';
const topThemeControl = '<div class="theme-setting top-theme-setting"><span id="pageBgLabel">頁面背景</span><div id="pageThemeChoice" class="theme-choice" role="radiogroup" aria-label="頁面背景"><button id="pageBgBlack" class="theme-option" type="button" role="radio" aria-checked="true">黑</button><button id="pageBgWhite" class="theme-option" type="button" role="radio" aria-checked="false">白</button></div></div>';

replaceExact(languageSelect, languageSelect + topThemeControl, "topbar language control");
replaceExact(themeControl, "", "old status-card theme control");
replaceExact('.theme-setting{display:flex;align-items:center;justify-content:space-between;gap:10px}', '.theme-setting{display:flex;align-items:center;justify-content:space-between;gap:10px}.top-theme-setting{justify-content:flex-start;gap:6px;white-space:nowrap}.top-theme-setting #pageBgLabel{font-size:12px;color:var(--muted)}.top-theme-setting .theme-choice{flex:0 0 auto}', "top theme compact css");

const output = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(output).digest("hex");
if (actualSha256 !== expectedSha256) {
  throw new Error(`v0.0.20 worker SHA-256 mismatch: ${actualSha256}`);
}
await writeFile(worker, output);
console.log(`Patched BoardVerse v0.0.20 worker.js (${output.length} bytes, SHA-256 ${actualSha256})`);
