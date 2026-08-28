import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "b153db101988e5cd1d1381ff4e4dde2e6caa54036556fb9dc470eded10e7f53a";
const expectedSha256 = "942e02299e7316f210bc3931fd6db855d3ee426aa3bf9020f05d6aa608c9651a";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.20 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.replace(from, to);
}

replaceExact('const APP_VERSION = "0.0.20";', 'const APP_VERSION = "0.0.21";', 'version');
const oldCatalogHead = "function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);";
const newCatalogHead = "function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var goGroup=document.createElement('optgroup');goGroup.label=lang==='en'?'Go':lang==='zh-Hans'?'围棋':'圍棋';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';sel.appendChild(goGroup);sel.appendChild(fiveGroup);Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='go9'?'9×9':id==='go13'?'13×13':id==='go19'?'19×19':id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='go9'||id==='go13'||id==='go19')goGroup.appendChild(o);else if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);";
replaceExact(oldCatalogHead, newCatalogHead, 'group Go sizes in game selector');

const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.21 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.21 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
