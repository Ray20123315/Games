import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "caec56b9b3642a057c6b2a3ef6b9d3db7a94dcac3e66359228bf515127131da8";
const expectedSha256 = "8f168113e24472377fec462bf61812e0b765a3707f72f7f6b249a6997e4a23e5";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.22 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.22";', 'const APP_VERSION = "0.0.23";', 'version');
replaceExact(
  '.point-btn.last::after,.sq.last::after{content:"";position:absolute;width:24%;aspect-ratio:1;border-radius:50%;background:#ffcf66;box-shadow:0 0 0 2px rgba(20,20,20,.5)}',
  '.point-btn.last::after,.sq.last::after{content:"";position:absolute;width:24%;aspect-ratio:1;border-radius:50%;background:#ffcf66;box-shadow:0 0 0 2px rgba(20,20,20,.5)}.line-board .point-btn.last::after{z-index:3}.hide-last-move-dot .line-board .point-btn.last::after{display:none}.last-move-setting{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12px;color:var(--muted);user-select:none}.last-move-setting input{accent-color:#c3a15f}',
  'last move marker css'
);
replaceExact(
  '<div id="roleInfo" class="role-line"></div><div id="goEstimate" class="go-estimate hidden"></div>',
  '<div id="roleInfo" class="role-line"></div><label id="lastMoveMarkerSetting" class="last-move-setting hidden"><input id="lastMoveMarkerToggle" type="checkbox" checked><span id="lastMoveMarkerLabel">上一手標記</span></label><div id="goEstimate" class="go-estimate hidden"></div>',
  'last move marker control'
);
replaceExact(
  'function renderStatus(r){',
  "function refreshLastMoveMarkerLabel(){var label=lang==='en'?'Last move marker':lang==='zh-Hans'?'上一手标记':'上一手標記';$('lastMoveMarkerLabel').textContent=label;$('lastMoveMarkerToggle').setAttribute('aria-label',label)}\nfunction setLastMoveMarkerEnabled(enabled){document.body.classList.toggle('hide-last-move-dot',!enabled)}\nfunction renderStatus(r){",
  'last move marker helpers'
);
replaceExact(
  "$('roleInfo').textContent=role;renderGoEstimate(r,g);",
  "$('roleInfo').textContent=role;$('lastMoveMarkerSetting').classList.toggle('hidden',!g||['go','gomoku','renju'].indexOf(g.type)<0);renderGoEstimate(r,g);",
  'last move marker visibility'
);
replaceExact(
  "$('pageBgWhite').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('white'))});\n$('soundEnabled').checked=localStorage.getItem('boardverseSound')!=='off';",
  "$('pageBgWhite').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('white'))});\nvar lastMoveMarkerEnabled=localStorage.getItem('boardverseLastMoveMarker')!=='off';$('lastMoveMarkerToggle').checked=lastMoveMarkerEnabled;setLastMoveMarkerEnabled(lastMoveMarkerEnabled);refreshLastMoveMarkerLabel();$('languageSelect').addEventListener('change',refreshLastMoveMarkerLabel);$('lastMoveMarkerToggle').addEventListener('change',function(){var enabled=!!this.checked;localStorage.setItem('boardverseLastMoveMarker',enabled?'on':'off');setLastMoveMarkerEnabled(enabled)});\n$('soundEnabled').checked=localStorage.getItem('boardverseSound')!=='off';",
  'last move marker persistence'
);

const out = Buffer.from(source, "utf8");
const outputSha256 = createHash("sha256").update(out).digest("hex");
if (outputSha256 !== expectedSha256) throw new Error(`v0.0.23 worker SHA-256 mismatch: ${outputSha256}`);
for (const marker of [
  'const APP_VERSION = "0.0.23";',
  'id="lastMoveMarkerToggle"',
  'boardverseLastMoveMarker',
  '.line-board .point-btn.last::after{z-index:3}',
  "['go','gomoku','renju'].indexOf(g.type)<0"
]) if (!source.includes(marker)) throw new Error(`v0.0.23 marker missing: ${marker}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.23 worker.js (${out.length} bytes, SHA-256 ${outputSha256})`);
