import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "475e6c9c2331e5d4cdaee11bd394aaabe1d6fbf783d27f0814098f94455ccb7c";
const expectedSha256 = "a724e4dd4d2dee8a1b4f8bf3a35adf4f8bca8aa8814305fc05e219744122e001";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.8 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`${label} marker not found`);
  source = source.replace(from, to);
}
replaceExact('const APP_VERSION = "0.0.8";', 'const APP_VERSION = "0.0.9";', "version");
replaceExact('.board-stage{height:100%;min-height:300px;display:grid;place-items:center;overflow:auto;border-radius:12px;background:#0a0f16}.board{position:relative;max-width:100%;touch-action:manipulation}', '.board-stage{height:100%;min-height:300px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#0a0f16;padding:4px}.board{position:relative;max-width:100%;max-height:100%;touch-action:manipulation;container-type:inline-size;transform-origin:center center}', "board viewport");
replaceExact('font-size:clamp(14px,3vw,28px);', 'font-size:clamp(12px,5.2cqw,28px);', "xiangqi font");
replaceExact('font-size:clamp(22px,5vw,52px);', 'font-size:clamp(20px,9cqw,52px);', "chess font");
replaceExact("function renderBoard(){if(!roomState||!roomState.gameState)return;renderGameBoard(roomState.gameState,$('board'),true)}", "function fitBoardToStage(el,g){if(!el||!g)return;var stage=el.parentElement;if(!stage)return;var desktop=document.body.classList.contains('room-mode')&&window.matchMedia&&window.matchMedia('(min-width:960px) and (orientation:landscape)').matches;var sw=Math.max(0,stage.clientWidth-8),sh=Math.max(0,stage.clientHeight-8);if(!sw)return;var ratio=g.type==='xiangqi'?9/10:1;var cap=g.type==='xiangqi'?560:(g.type==='go'||g.type==='gomoku'||g.type==='renju'?(g.size>=19?620:g.size>=15?540:g.size>=13?500:430):720);var w=Math.min(sw,cap);if(desktop&&sh>0)w=Math.min(w,sh*ratio);el.style.width=Math.max(1,Math.floor(w))+'px';el.style.height=Math.max(1,Math.floor(w/ratio))+'px';el.style.maxWidth='none';el.style.maxHeight='none'}\nfunction renderBoard(){if(!roomState||!roomState.gameState)return;renderGameBoard(roomState.gameState,$('board'),true);requestAnimationFrame(function(){fitBoardToStage($('board'),roomState&&roomState.gameState)})}", "board fit");
replaceExact("$('notifyBtn').addEventListener('click',setupNotifications);", "$('notifyBtn').addEventListener('click',setupNotifications);\nif('ResizeObserver'in window){new ResizeObserver(function(){if(roomState&&roomState.gameState&&!$('room').classList.contains('hidden'))fitBoardToStage($('board'),roomState.gameState)}).observe($('boardStage'))}else{window.addEventListener('resize',function(){if(roomState&&roomState.gameState)fitBoardToStage($('board'),roomState.gameState)})}", "board resize observer");
const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.9 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.9 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
