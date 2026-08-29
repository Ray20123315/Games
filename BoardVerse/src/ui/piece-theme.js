export const PIECE_THEME_STYLE = `<style id="bv-piece-theme-lock">
.board{color-scheme:only light}
.stone,.chess-piece,.qiguo-piece{forced-color-adjust:none}
.stone.black{background-color:#050607!important;background-image:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%)!important}
.stone.white{background-color:#f4f6f8!important;background-image:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%)!important}
.chess-piece.white{color:#faf7ee!important;-webkit-text-fill-color:#faf7ee!important}
.chess-piece.black{color:#11151b!important;-webkit-text-fill-color:#11151b!important}
</style>`;

const QIGUO_COLOR_SOURCE = "s.style.background=colors[x.country]||'#ddd';s.style.color=(x.country==='yan'||x.country==='chu'||x.country==='qi'||x.country==='zhao')?'#fff':'#17130b';";
const QIGUO_COLOR_LOCKED = "s.style.setProperty('background',colors[x.country]||'#ddd','important');s.style.setProperty('color',(x.country==='yan'||x.country==='chu'||x.country==='qi'||x.country==='zhao')?'#fff':'#17130b','important');";

export function hardenPieceThemeHtml(source) {
  let html = String(source ?? "");
  const legacyBoard = html.includes(".stone.white") || html.includes(".chess-piece.white") || html.includes(".qiguo-piece");
  if (!legacyBoard) return html;
  if (!html.includes('id="bv-piece-theme-lock"')) html = html.replace("</head>", `${PIECE_THEME_STYLE}</head>`);
  if (html.includes(QIGUO_COLOR_SOURCE)) html = html.replace(QIGUO_COLOR_SOURCE, QIGUO_COLOR_LOCKED);
  return html;
}
