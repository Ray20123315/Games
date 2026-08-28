import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "ab052e9ed81242c1585e46975dc6b2dd160557ac41a2c59fffcdf6a7831ab470";
const expectedSha256 = "7df579d9f401754096b85fcd6613ab3016caa6458ff3b2e6baa15c6216f9068e";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.17 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker is not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.17";', 'const APP_VERSION = "0.0.18";', "version");
replaceExact('--accent:#68adff;--accent2:#9ac9ff;', '--accent:#d4af37;--accent2:#ffe49a;', "gold accent variables");
replaceExact(
  '.btn{border:1px solid #4a90df;background:linear-gradient(180deg,#67afff,#3d8bdc);color:#07111e;font-weight:800;min-height:40px;padding:9px 13px;border-radius:11px}',
  '.btn{border:1px solid #a77a00;background:linear-gradient(135deg,#8a6500 0%,#d4af37 48%,#fff0a6 100%);color:#201500;font-weight:800;min-height:40px;padding:9px 13px;border-radius:11px}',
  "gold primary buttons"
);
replaceExact(
  '.point-btn.selected{outline:3px solid #69afff;outline-offset:2px}',
  '.point-btn.selected{outline:3px solid #d4af37;outline-offset:2px}',
  "gold board selection accent"
);
replaceExact(
  '.info-btn{width:22px;height:22px;border:1px solid #4a607d;border-radius:50%;background:#172333;color:#b9d8ff;font-size:12px;font-weight:900;padding:0;display:inline-grid;place-items:center;flex:0 0 auto}.info-btn:focus-visible,.btn:focus-visible,.compact-btn:focus-visible,.compact-select:focus-visible,input:focus-visible,select:focus-visible,.role-choice:focus-visible{outline:3px solid rgba(104,173,255,.44);outline-offset:2px}',
  '.info-btn{width:22px;height:22px;border:1px solid #a77a00;border-radius:50%;background:linear-gradient(135deg,#8a6500,#d4af37 55%,#fff0a6);color:#201500;font-size:12px;font-weight:900;padding:0;display:inline-grid;place-items:center;flex:0 0 auto}.info-btn:focus-visible,.btn:focus-visible,.compact-btn:focus-visible,.compact-select:focus-visible,input:focus-visible,select:focus-visible,.role-choice:focus-visible{outline:3px solid rgba(212,175,55,.5);outline-offset:2px}',
  "gold info and focus accents"
);
replaceExact(
  '.go-estimate{margin-top:8px;padding:8px 10px;border:1px solid #2d425b;border-radius:10px;background:#0b1621;color:#c9d5e3;font-size:12px;line-height:1.5}.board-bg-setting{display:flex;',
  '.go-estimate{margin-top:8px;padding:8px 10px;border:1px solid #9b781e;border-radius:10px;background:linear-gradient(135deg,rgba(138,101,0,.2),rgba(255,240,166,.08));color:var(--text);font-size:12px;line-height:1.5}.theme-setting{display:flex;align-items:center;justify-content:space-between;gap:10px}.theme-choice{display:inline-flex;border:1px solid var(--line);border-radius:10px;padding:2px;background:var(--panel3)}.theme-option{min-width:48px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-weight:800}.theme-option[aria-checked="true"]{background:linear-gradient(135deg,#8a6500 0%,#d4af37 48%,#fff0a6 100%);color:#201500;box-shadow:0 2px 10px rgba(138,101,0,.28)}body.page-theme-black{background:#000!important;color-scheme:dark}body.page-theme-white{background:#fff!important;color-scheme:light;--bg:#fff;--panel:#fff;--panel2:#f7f3e8;--panel3:#fff;--text:#17130b;--muted:#6d6452;--line:#d8c9a6;--shadow:0 18px 48px rgba(73,55,14,.12)}body.page-theme-white .field input,body.page-theme-white .field select,body.page-theme-white .room-search,body.page-theme-white .compact-select,body.page-theme-white .compact-btn,body.page-theme-white .sound-wrap,body.page-theme-white .game-card,body.page-theme-white .room-column,body.page-theme-white .room-row,body.page-theme-white .setting-row input[type=number],body.page-theme-white .setting-row select,body.page-theme-white .setting-check,body.page-theme-white .queue-settings select,body.page-theme-white .replay-row,body.page-theme-white .replay-stage,body.page-theme-white .dialog-card,body.page-theme-white .popover,body.page-theme-white .toast{background:var(--panel3);color:var(--text);border-color:var(--line)}body.page-theme-white .setting-label,body.page-theme-white .field label,body.page-theme-white .field-label,body.page-theme-white .result-reason,body.page-theme-white .popover p,body.page-theme-white .dialog-card p{color:#554c3c}.eyebrow,.brand-mark,.turn-banner{background:linear-gradient(135deg,#8a6500 0%,#d4af37 48%,#fff0a6 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.board-bg-setting{display:flex;',
  "theme css"
);
replaceExact(
  '<div class="board-bg-setting"><label for="pageBgColor"><span id="pageBgLabel">頁面背景</span><input id="pageBgColor" type="color" value="#0b1118" aria-label="頁面背景"></label><button id="pageBgReset" class="btn ghost" type="button">預設</button></div>',
  '<div class="board-bg-setting theme-setting"><span id="pageBgLabel">頁面背景</span><div id="pageThemeChoice" class="theme-choice" role="radiogroup" aria-label="頁面背景"><button id="pageBgBlack" class="theme-option" type="button" role="radio" aria-checked="true">黑</button><button id="pageBgWhite" class="theme-option" type="button" role="radio" aria-checked="false">白</button></div></div>',
  "black white controls"
);

const nl = String.fromCharCode(10);
const oldHelpers = [
  "function isPageBgColor(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))}",
  "function applyPageBackground(value){var v=isPageBgColor(value)?String(value).toLowerCase():'';document.body.classList.remove('custom-board-bg');['--board-bg','--board-bg-light','--board-bg-dark'].forEach(function(k){document.documentElement.style.removeProperty(k)});document.body.style.removeProperty('background');if(v)document.body.style.setProperty('background',v,'important');return v}",
  "function refreshPageBgLabels(){var label=lang==='en'?'Page background':lang==='zh-Hans'?'页面背景':'頁面背景',reset=lang==='en'?'Default':lang==='zh-Hans'?'默认':'預設';$('pageBgLabel').textContent=label;$('pageBgColor').setAttribute('aria-label',label);$('pageBgReset').textContent=reset}",
  ""
].join(nl);
const newHelpers = [
  "function normalizePageTheme(v){v=String(v||'').toLowerCase();if(v==='white'||v==='#fff'||v==='#ffffff')return 'white';if(v==='black'||v==='#000'||v==='#000000')return 'black';if(/^#[0-9a-f]{6}$/.test(v)){var n=parseInt(v.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;return (r*299+g*587+b*114)/1000>=160?'white':'black'}return 'black'}",
  "function applyPageTheme(value){var v=normalizePageTheme(value);document.body.classList.remove('custom-board-bg','page-theme-black','page-theme-white');['--board-bg','--board-bg-light','--board-bg-dark'].forEach(function(k){document.documentElement.style.removeProperty(k)});document.body.style.removeProperty('background');document.body.classList.add('page-theme-'+v);var black=$('pageBgBlack'),white=$('pageBgWhite');if(black)black.setAttribute('aria-checked',v==='black'?'true':'false');if(white)white.setAttribute('aria-checked',v==='white'?'true':'false');var meta=document.querySelector('meta[name=theme-color]');if(meta)meta.setAttribute('content',v==='white'?'#ffffff':'#000000');return v}",
  "function refreshPageBgLabels(){var label=lang==='en'?'Page background':lang==='zh-Hans'?'页面背景':'頁面背景',black=lang==='en'?'Black':lang==='zh-Hans'?'黑':'黑',white=lang==='en'?'White':lang==='zh-Hans'?'白':'白';$('pageBgLabel').textContent=label;$('pageThemeChoice').setAttribute('aria-label',label);$('pageBgBlack').textContent=black;$('pageBgWhite').textContent=white}",
  ""
].join(nl);
replaceExact(oldHelpers, newHelpers, "black white theme helpers");

replaceExact(
  "var savedPageBg=localStorage.getItem('boardversePageBackground')||localStorage.getItem('boardverseBoardBackground')||'';if(isPageBgColor(savedPageBg)){$('pageBgColor').value=savedPageBg;localStorage.setItem('boardversePageBackground',savedPageBg)}localStorage.removeItem('boardverseBoardBackground');applyPageBackground(savedPageBg);refreshPageBgLabels();$('languageSelect').addEventListener('change',refreshPageBgLabels);$('pageBgColor').addEventListener('input',function(){var v=applyPageBackground(this.value);if(v)localStorage.setItem('boardversePageBackground',v)});$('pageBgReset').addEventListener('click',function(){localStorage.removeItem('boardversePageBackground');$('pageBgColor').value='#0b1118';applyPageBackground('')});",
  "var savedPageTheme=localStorage.getItem('boardversePageTheme')||localStorage.getItem('boardversePageBackground')||localStorage.getItem('boardverseBoardBackground')||'black';var pageTheme=applyPageTheme(savedPageTheme);localStorage.setItem('boardversePageTheme',pageTheme);localStorage.removeItem('boardversePageBackground');localStorage.removeItem('boardverseBoardBackground');refreshPageBgLabels();$('languageSelect').addEventListener('change',refreshPageBgLabels);$('pageBgBlack').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('black'))});$('pageBgWhite').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('white'))});",
  "black white theme persistence"
);

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.18 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.18 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
