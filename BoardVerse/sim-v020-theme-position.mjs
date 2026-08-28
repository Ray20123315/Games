import { readFile, writeFile } from "node:fs/promises";

const worker = new URL("./worker.js", import.meta.url);
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

await writeFile(worker, source, "utf8");
