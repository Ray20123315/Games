import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
const inputHash = createHash("sha256").update(source).digest("hex");
if (inputHash !== "650d3f3e2931dc6ac214f0bbb3cea093ef6693b66e18ec020650e98ad35f043a") throw new Error(`v0.0.30 source hash mismatch: ${inputHash}`);
function r(a,b,l){const i=source.indexOf(a);if(i<0)throw new Error(l+" marker not found");if(source.indexOf(a,i+a.length)>=0)throw new Error(l+" marker not unique");source=source.replace(a,b)}

r('const APP_VERSION = "0.0.29";','const APP_VERSION = "0.0.30";','version');
r('</style>','.board{color-scheme:only light}.stone,.chess-piece,.qiguo-piece{forced-color-adjust:none}</style>','piece color-scheme lock');
r('.stone.black{background-color:#050607;background-image:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%);box-shadow:0 3px 7px rgba(0,0,0,.48),inset 0 0 0 1px #5d646a}.stone.white{background-color:#f4f6f8;background-image:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%);box-shadow:0 3px 7px rgba(0,0,0,.42),inset 0 0 0 2px #606a74}', '.stone.black{background-color:#050607!important;background-image:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%)!important;box-shadow:0 3px 7px rgba(0,0,0,.48),inset 0 0 0 1px #5d646a}.stone.white{background-color:#f4f6f8!important;background-image:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%)!important;box-shadow:0 3px 7px rgba(0,0,0,.42),inset 0 0 0 2px #606a74}', 'stone colors');
r('.chess-piece.white{color:#faf7ee;-webkit-text-stroke:1.25px #1d2229;text-shadow:0 1px 0 #111,0 3px 4px rgba(0,0,0,.45)}.chess-piece.black{color:#11151b;-webkit-text-stroke:1px #d9dde2;text-shadow:0 2px 2px rgba(255,255,255,.16)}', '.chess-piece.white{color:#faf7ee!important;-webkit-text-fill-color:#faf7ee!important;-webkit-text-stroke:1.25px #1d2229;text-shadow:0 1px 0 #111,0 3px 4px rgba(0,0,0,.45)}.chess-piece.black{color:#11151b!important;-webkit-text-fill-color:#11151b!important;-webkit-text-stroke:1px #d9dde2;text-shadow:0 2px 2px rgba(255,255,255,.16)}', 'chess colors');
r("s.style.background=colors[x.country]||'#ddd';s.style.color=(x.country==='yan'||x.country==='chu'||x.country==='qi'||x.country==='zhao')?'#fff':'#17130b';", "s.style.setProperty('background',colors[x.country]||'#ddd','important');s.style.setProperty('color',(x.country==='yan'||x.country==='chu'||x.country==='qi'||x.country==='zhao')?'#fff':'#17130b','important');", 'qiguo colors');

const out=Buffer.from(source,'utf8');
await writeFile(worker,out);
console.log('V030_BYTES='+out.length);
console.log('V030_SHA256='+createHash('sha256').update(out).digest('hex'));
