export function fixV028UnoColorHtml(source,path=""){
  const s=String(source||"");
  if(!(path==="/cards"||path.startsWith("/cards/")))return s;
  return s.replace("目前顏色 '+g.currentColor+' · 牌堆 '+g.drawCount","目前顏色 '+unoColorName(g.currentColor)+' · 牌堆 '+g.drawCount");
}
