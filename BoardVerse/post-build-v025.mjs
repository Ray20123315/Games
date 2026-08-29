import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
const inputHash = createHash("sha256").update(source).digest("hex");
const expectedInputHash = "bf661f6d7f09c21742d0d75fd2cda4825d270136ef5a64d70399c69769ee2ed7";
const expectedOutputHash = "5953ff897a8d6256cf03336b8864ad8388ed3ee00d53d5d914d6347e6c84d2a1";
if (inputHash !== expectedInputHash) throw new Error(`v0.0.25 source hash mismatch: ${inputHash}`);

const oldFn = `function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var goGroup=document.createElement('optgroup');goGroup.label=lang==='en'?'Go':lang==='zh-Hans'?'围棋':'圍棋';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';sel.appendChild(goGroup);sel.appendChild(fiveGroup);Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='go9'?'9×9':id==='go13'?'13×13':id==='go19'?'19×19':id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='go9'||id==='go13'||id==='go19')goGroup.appendChild(o);else if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);var c=document.createElement('article');c.className='game-card';var detail=document.createElement('button');detail.type='button';detail.className='btn ghost game-rule-detail';detail.textContent=ruleDetailsLabel();detail.addEventListener('click',function(){openGameRuleDetails(id)});var st=document.createElement('strong');st.textContent=gameText(id,0);var p=document.createElement('p');p.textContent=gameText(id,1);c.appendChild(detail);c.appendChild(st);c.appendChild(p);$('gameList').appendChild(c)});sel.appendChild(fiveGroup);if(current&&SERVER_GAMES[current])sel.value=current;renderRuleFields()}`;
const newFn = `function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var goGroup=document.createElement('optgroup');goGroup.label=lang==='en'?'Go':lang==='zh-Hans'?'围棋':'圍棋';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';var xiangqiGroup=document.createElement('optgroup');xiangqiGroup.label=lang==='en'?'Xiangqi & variants':lang==='zh-Hans'?'象棋与变种':'象棋與變種';sel.appendChild(goGroup);sel.appendChild(fiveGroup);sel.appendChild(xiangqiGroup);Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='go9'?'9×9':id==='go13'?'13×13':id==='go19'?'19×19':id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='go9'||id==='go13'||id==='go19')goGroup.appendChild(o);else if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else if(id==='xiangqi'||id==='banqi'||id==='xiangqi_random')xiangqiGroup.appendChild(o);else sel.appendChild(o);var c=document.createElement('article');c.className='game-card';var detail=document.createElement('button');detail.type='button';detail.className='btn ghost game-rule-detail';detail.textContent=ruleDetailsLabel();detail.addEventListener('click',function(){openGameRuleDetails(id)});var st=document.createElement('strong');st.textContent=gameText(id,0);var p=document.createElement('p');p.textContent=gameText(id,1);c.appendChild(detail);c.appendChild(st);c.appendChild(p);$('gameList').appendChild(c)});if(current&&SERVER_GAMES[current])sel.value=current;renderRuleFields()}`;
const first = source.indexOf(oldFn);
if (first < 0) throw new Error('renderGameCatalog v0.0.24 marker not found');
if (source.indexOf(oldFn, first + oldFn.length) >= 0) throw new Error('renderGameCatalog marker not unique');
source = source.replace(oldFn, newFn);
const versionMarker = 'const APP_VERSION = "0.0.24";';
if (!source.includes(versionMarker)) throw new Error('v0.0.24 version marker not found');
source = source.replace(versionMarker, 'const APP_VERSION = "0.0.25";');

const outputHash = createHash("sha256").update(source).digest("hex");
if (outputHash !== expectedOutputHash) throw new Error(`v0.0.25 output hash mismatch: ${outputHash}`);
await writeFile(worker, source, "utf8");
console.log(`Patched BoardVerse v0.0.25 worker.js (${Buffer.byteLength(source)} bytes, SHA-256 ${outputHash})`);
