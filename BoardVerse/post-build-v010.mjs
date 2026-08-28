import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "a724e4dd4d2dee8a1b4f8bf3a35adf4f8bca8aa8814305fc05e219744122e001";
const expectedSha256 = "2c8991be680545eced805c75ac882c40f44704fa034eb38fdc5deffbc50cbc47";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.9 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`${label} marker not found`);
  source = source.replace(from, to);
}
replaceExact('const APP_VERSION = "0.0.9";', 'const APP_VERSION = "0.0.10";', "version");
replaceExact(
  '.board-stage{height:100%;min-height:300px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#0a0f16;padding:4px}.board{position:relative;max-width:100%;max-height:100%;touch-action:manipulation;container-type:inline-size;transform-origin:center center}',
  '.board-stage{height:100%;min-height:300px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#0a0f16;padding:4px}.board-fit{position:relative;overflow:visible;flex:none}.board-fit>.board{position:absolute;left:0;top:0;max-width:none;max-height:none;touch-action:manipulation;container-type:inline-size;transform-origin:top left}.board{position:relative;max-width:100%;max-height:100%;touch-action:manipulation;container-type:inline-size;transform-origin:center center}',
  "board fit css"
);
replaceExact(
  '.point-btn{position:absolute;width:min(5.2%,34px);aspect-ratio:1;border:0;background:transparent;padding:0;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center}.line-board .point-btn{width:calc(100% / 15);max-width:38px}',
  '.point-btn{position:absolute;width:min(5.2%,34px);aspect-ratio:1;min-width:0;min-height:0;border:0;background:transparent;padding:0;line-height:1;-webkit-appearance:none;appearance:none;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center}.xiangqi-board .point-btn{width:34px;height:34px;aspect-ratio:auto;min-width:0;min-height:0}.line-board .point-btn{width:calc(100% / 15);max-width:38px}',
  "point shape css"
);
replaceExact(
  '.xq-piece{width:86%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#f3db9e;',
  '.xq-piece{width:86%;height:86%;aspect-ratio:auto;border-radius:50%;display:grid;place-items:center;background:#f3db9e;',
  "xiangqi piece shape"
);
replaceExact(
  '.point-btn{min-width:26px}.xq-piece{font-size:clamp(13px,6vw,24px)}',
  '.line-board .point-btn{min-width:26px}.xq-piece{font-size:clamp(13px,6vw,24px)}',
  "mobile point sizing"
);
replaceExact(
  '<div class="board-card card"><div id="boardStage" class="board-stage"><div id="board" class="board" aria-label="Board"></div></div></div>',
  '<div class="board-card card"><div id="boardStage" class="board-stage"><div id="boardFit" class="board-fit"><div id="board" class="board" aria-label="Board"></div></div></div></div>',
  "board fit wrapper"
);
replaceExact(
  "function fitBoardToStage(el,g){if(!el||!g)return;var stage=el.parentElement;if(!stage)return;var desktop=document.body.classList.contains('room-mode')&&window.matchMedia&&window.matchMedia('(min-width:960px) and (orientation:landscape)').matches;var sw=Math.max(0,stage.clientWidth-8),sh=Math.max(0,stage.clientHeight-8);if(!sw)return;var ratio=g.type==='xiangqi'?9/10:1;var cap=g.type==='xiangqi'?560:(g.type==='go'||g.type==='gomoku'||g.type==='renju'?(g.size>=19?620:g.size>=15?540:g.size>=13?500:430):720);var w=Math.min(sw,cap);if(desktop&&sh>0)w=Math.min(w,sh*ratio);el.style.width=Math.max(1,Math.floor(w))+'px';el.style.height=Math.max(1,Math.floor(w/ratio))+'px';el.style.maxWidth='none';el.style.maxHeight='none'}",
  "function intrinsicBoardSize(g){if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){var n=g.size||15;var s=n>=19?620:n>=15?540:n>=13?500:430;return{w:s,h:s}}return{w:720,h:720}}\nfunction fitBoardToStage(el,g){if(!el||!g)return;var fit=$('boardFit'),stage=$('boardStage');if(!fit||!stage)return;var base=intrinsicBoardSize(g);var desktop=document.body.classList.contains('room-mode')&&window.matchMedia&&window.matchMedia('(min-width:960px) and (orientation:landscape)').matches;var sw=Math.max(0,stage.clientWidth-8),sh=Math.max(0,stage.clientHeight-8);if(!sw)return;var scale=Math.min(1,sw/base.w);if(desktop&&sh>0)scale=Math.min(scale,sh/base.h);scale=Math.max(.08,scale);fit.style.width=Math.max(1,Math.floor(base.w*scale))+'px';fit.style.height=Math.max(1,Math.floor(base.h*scale))+'px';el.style.width=base.w+'px';el.style.height=base.h+'px';el.style.maxWidth='none';el.style.maxHeight='none';el.style.transform='scale('+scale+')';el.style.transformOrigin='top left'}",
  "uniform board scaling"
);
const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.10 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.10 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
