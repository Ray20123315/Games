import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
const sourceSha256 = "2c8991be680545eced805c75ac882c40f44704fa034eb38fdc5deffbc50cbc47";
const expectedSha256 = "541ff63d982204bdc27256ed3f7f7788dd5a412551923c5476cea05645a19aa3";
const input = await readFile(worker);
const actualSourceSha256 = createHash("sha256").update(input).digest("hex");
if (actualSourceSha256 !== sourceSha256) throw new Error(`v0.0.10 worker SHA-256 mismatch: ${actualSourceSha256}`);
let source = input.toString("utf8");
function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`${label} marker not found`);
  source = source.replace(from, to);
}
replaceExact('const APP_VERSION = "0.0.10";', 'const APP_VERSION = "0.0.11";', "version");
replaceExact(
  '.xiangqi-board .point-btn{width:34px;height:34px;aspect-ratio:auto;min-width:0;min-height:0}.line-board .point-btn{width:calc(100% / 15);max-width:38px}',
  '.xiangqi-board .point-btn{width:8.6cqw;height:8.6cqw;max-width:48px;max-height:48px;aspect-ratio:auto;min-width:0;min-height:0}.line-board .point-btn{width:var(--point-size,6.2cqw);max-width:none}',
  "piece sizing"
);
replaceExact(
  '.stone{display:block;width:78%;aspect-ratio:1;border-radius:50%;position:relative;z-index:1}',
  '.stone{display:block;width:84%;aspect-ratio:1;border-radius:50%;position:relative;z-index:1}',
  "intersection stones"
);
replaceExact(
  '.xq-piece{width:86%;height:86%;aspect-ratio:auto;border-radius:50%;display:grid;place-items:center;background:#f3db9e;border:2px solid #452b17;font-family:"Noto Serif TC","PMingLiU",serif;font-weight:900;font-size:clamp(12px,5.2cqw,28px);',
  '.xq-piece{width:94%;height:94%;aspect-ratio:auto;border-radius:50%;display:grid;place-items:center;background:#f3db9e;border:2px solid #452b17;font-family:"Noto Serif TC","PMingLiU",serif;font-weight:900;font-size:clamp(18px,5.6cqw,31px);',
  "xiangqi disc"
);
replaceExact(
  '.line-board .point-btn{min-width:26px}.xq-piece{font-size:clamp(13px,6vw,24px)}.chess-piece{font-size:clamp(22px,11vw,46px)}',
  '.line-board .point-btn{min-width:0}.chess-piece{font-size:clamp(22px,11vw,46px)}',
  "mobile sizing"
);
replaceExact(
  "function renderIntersectionBoard(g,el,interactive){var n=g.size;el.className='board line-board';el.style.width='100%';el.style.maxWidth=n>=19?'620px':n>=15?'540px':n>=13?'500px':'430px';",
  "function renderIntersectionBoard(g,el,interactive){var n=g.size;el.className='board line-board';el.style.width='100%';el.style.maxWidth=n>=19?'620px':n>=15?'540px':n>=13?'500px':'430px';el.style.setProperty('--point-size',n<=9?'9.8cqw':n<=13?'7.2cqw':n<=15?'6.2cqw':'4.8cqw');",
  "intersection piece scale"
);
const out = Buffer.from(source, "utf8");
const actualSha256 = createHash("sha256").update(out).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`v0.0.11 worker SHA-256 mismatch: ${actualSha256}`);
await writeFile(worker, out);
console.log(`Patched BoardVerse v0.0.11 worker.js (${out.length} bytes, SHA-256 ${actualSha256})`);
