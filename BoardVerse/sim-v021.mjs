import { readFile, writeFile } from "node:fs/promises";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
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

await writeFile(worker, source, "utf8");
