import assert from "node:assert/strict";
import { hardenPieceThemeHtml, PIECE_THEME_STYLE } from "../src/ui/piece-theme.js";

const qiguoSource = "s.style.background=colors[x.country]||'#ddd';s.style.color=(x.country==='yan'||x.country==='chu'||x.country==='qi'||x.country==='zhao')?'#fff':'#17130b';";
const legacy = `<!doctype html><html><head><style>.stone.white{background-color:#f4f6f8}.chess-piece.white{color:#faf7ee}.qiguo-piece{}</style></head><body><script>${qiguoSource}</script></body></html>`;
const hardened = hardenPieceThemeHtml(legacy);
assert.match(hardened, /id="bv-piece-theme-lock"/);
assert.match(hardened, /\.board\{color-scheme:only light\}/);
assert.match(hardened, /background-color:#f4f6f8!important/);
assert.match(hardened, /-webkit-text-fill-color:#faf7ee!important/);
assert.match(hardened, /setProperty\('background',colors\[x\.country\]\|\|'#ddd','important'\)/);
assert.equal(hardenPieceThemeHtml(hardened).split('id="bv-piece-theme-lock"').length - 1, 1);
assert.equal(hardenPieceThemeHtml("<html><head></head><body>Account</body></html>"), "<html><head></head><body>Account</body></html>");
assert.ok(PIECE_THEME_STYLE.includes("forced-color-adjust:none"));
console.log("piece-theme tests passed");
