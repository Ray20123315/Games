import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "1587eaa1a6ec18b4ebc1a38c5c94fc4b6af0a9f73e25c816adbb8c763ff4f1c9";
const expectedSha256 = "4797d861c5d5fd6ce4c4ac8af321d8e985945794f09caa5b83e6ac5603f1fae6";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.15 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.15";', 'const APP_VERSION = "0.0.16";', "version");

replaceExact(
  'body.custom-board-bg .line-board{background:linear-gradient(135deg,var(--board-bg-light),var(--board-bg-dark))}body.custom-board-bg .xiangqi-board{background:linear-gradient(145deg,var(--board-bg-light),var(--board-bg-dark))}body.custom-board-bg .chess-board .sq.light{background:var(--board-bg-light)}body.custom-board-bg .chess-board .sq.dark{background:var(--board-bg-dark)}body.custom-board-bg .reversi-board .sq.light,body.custom-board-bg .reversi-board .sq.dark{background:var(--board-bg);border-color:var(--board-bg-dark)}',
  '',
  "remove board color overrides"
);

replaceExact(
  '<div class="board-bg-setting"><label for="boardBgColor"><span id="boardBgLabel">棋盤背景</span><input id="boardBgColor" type="color" value="#c79655" aria-label="棋盤背景"></label><button id="boardBgReset" class="btn ghost" type="button">預設</button></div>',
  '<div class="board-bg-setting"><label for="pageBgColor"><span id="pageBgLabel">頁面背景</span><input id="pageBgColor" type="color" value="#0b1118" aria-label="頁面背景"></label><button id="pageBgReset" class="btn ghost" type="button">預設</button></div>',
  "page background controls"
);

const nl = String.fromCharCode(10);
const oldHelpers = [
  "function isBoardBgColor(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))}",
  "function boardBgShade(hex,amount){var n=parseInt(hex.slice(1),16),p=Math.max(-1,Math.min(1,amount)),t=p<0?0:255,q=Math.abs(p),r=n>>16,g=n>>8&255,b=n&255;function c(x){return Math.round((t-x)*q+x).toString(16).padStart(2,'0')}return '#'+c(r)+c(g)+c(b)}",
  "function applyBoardBackground(value){var v=isBoardBgColor(value)?String(value).toLowerCase():'';document.body.classList.toggle('custom-board-bg',!!v);['--board-bg','--board-bg-light','--board-bg-dark'].forEach(function(k){document.documentElement.style.removeProperty(k)});if(v){document.documentElement.style.setProperty('--board-bg',v);document.documentElement.style.setProperty('--board-bg-light',boardBgShade(v,.24));document.documentElement.style.setProperty('--board-bg-dark',boardBgShade(v,-.2))}return v}",
  "function refreshBoardBgLabels(){var label=lang==='en'?'Board background':lang==='zh-Hans'?'棋盘背景':'棋盤背景',reset=lang==='en'?'Default':lang==='zh-Hans'?'默认':'預設';$('boardBgLabel').textContent=label;$('boardBgColor').setAttribute('aria-label',label);$('boardBgReset').textContent=reset}",
  ""
].join(nl);
const newHelpers = [
  "function isPageBgColor(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))}",
  "function applyPageBackground(value){var v=isPageBgColor(value)?String(value).toLowerCase():'';document.body.classList.remove('custom-board-bg');['--board-bg','--board-bg-light','--board-bg-dark'].forEach(function(k){document.documentElement.style.removeProperty(k)});document.body.style.removeProperty('background');if(v)document.body.style.setProperty('background',v,'important');return v}",
  "function refreshPageBgLabels(){var label=lang==='en'?'Page background':lang==='zh-Hans'?'页面背景':'頁面背景',reset=lang==='en'?'Default':lang==='zh-Hans'?'默认':'預設';$('pageBgLabel').textContent=label;$('pageBgColor').setAttribute('aria-label',label);$('pageBgReset').textContent=reset}",
  ""
].join(nl);
replaceExact(oldHelpers, newHelpers, "page background helpers");

replaceExact(
  "var savedBoardBg=localStorage.getItem('boardverseBoardBackground')||'';if(isBoardBgColor(savedBoardBg))$('boardBgColor').value=savedBoardBg;applyBoardBackground(savedBoardBg);refreshBoardBgLabels();$('languageSelect').addEventListener('change',refreshBoardBgLabels);$('boardBgColor').addEventListener('input',function(){var v=applyBoardBackground(this.value);if(v)localStorage.setItem('boardverseBoardBackground',v)});$('boardBgReset').addEventListener('click',function(){localStorage.removeItem('boardverseBoardBackground');$('boardBgColor').value='#c79655';applyBoardBackground('')});",
  "var savedPageBg=localStorage.getItem('boardversePageBackground')||localStorage.getItem('boardverseBoardBackground')||'';if(isPageBgColor(savedPageBg)){$('pageBgColor').value=savedPageBg;localStorage.setItem('boardversePageBackground',savedPageBg)}localStorage.removeItem('boardverseBoardBackground');applyPageBackground(savedPageBg);refreshPageBgLabels();$('languageSelect').addEventListener('change',refreshPageBgLabels);$('pageBgColor').addEventListener('input',function(){var v=applyPageBackground(this.value);if(v)localStorage.setItem('boardversePageBackground',v)});$('pageBgReset').addEventListener('click',function(){localStorage.removeItem('boardversePageBackground');$('pageBgColor').value='#0b1118';applyPageBackground('')});",
  "page background persistence"
);

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.16 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.16 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
