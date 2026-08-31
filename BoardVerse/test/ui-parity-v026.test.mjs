import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { botPage } from "../src/bot/page.js";
import { cardPortalPage } from "../src/cards/page.js";
import { platformHomePage, playPortalPage } from "../src/ui/platform-pages.js";
import { injectCardBoardParity } from "../src/ui/card-board-parity.js";
import { injectSingleplayerBoardParity } from "../src/ui/singleplayer-board-parity.js";
import { enhanceV025Html } from "../src/ui/page-parity-i18n-v025.js";
import { enhanceV026Html } from "../src/ui/page-parity-v026.js";

function scripts(source){return [...String(source).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean)}

const cardBase=injectCardBoardParity(cardPortalPage("ABC234"));
const card=enhanceV026Html(enhanceV025Html(cardBase,"/cards/ABC234"),"/cards/ABC234");
for(const marker of ["boardverse-v026-full-parity-style","boardverse-v026-full-parity-script","bv-v026-topbar","bv-v026-logo","function key(id=rid)","function save(t,id=rid)","save(d.token,d.roomId)","localStorage.getItem('bvCardToken:')","bv-v026-known-player","a:not(.brand)","if(a.textContent!==next)a.textContent=next","if(meta.textContent!==nextMeta)meta.textContent=nextMeta","if(first&&first.textContent!==nextFoot)first.textContent=nextFoot"])assert.ok(card.includes(marker),marker);
assert.doesNotMatch(card,/if\(brand\)brand\.innerHTML='BOARD<b>VERSE<\/b> · '/);
assert.doesNotMatch(card,/\$\$\('a',top\)\.forEach/);
for(const [i,script] of scripts(card).entries())new vm.Script(script,{filename:`card-v026-${i}.js`});

const single=enhanceV026Html(enhanceV025Html(injectSingleplayerBoardParity(botPage()),"/singleplayer"),"/singleplayer");
for(const marker of ["boardverse-v026-full-parity-style","boardverse-v026-full-parity-script","bv-singleplayer-v025","gameCatalog","max-width:1100px","a:not(.brand)","if(a.textContent!==next)a.textContent=next"])assert.ok(single.includes(marker),marker);
assert.doesNotMatch(single,/\$\$\('a',top\)\.forEach/);
for(const [i,script] of scripts(single).entries())new vm.Script(script,{filename:`single-v026-${i}.js`});

for(const [path,page] of [["/home",platformHomePage()],["/play",playPortalPage()]]){
  const out=enhanceV026Html(enhanceV025Html(page,path),path);
  assert.match(out,/boardverse-v026-full-parity-script/);
  for(const [i,script] of scripts(out).entries())new vm.Script(script,{filename:`entry-${path.slice(1)}-${i}.js`});
}

const boards=enhanceV026Html('<html><head></head><body><div id="gameList" hidden></div><script id="boardverse-boards-page-script">window.__boardsFixture=true;</script></body></html>',"/boards");
assert.match(boards,/id="bvGameCatalogToggle" data-bv-v026-sentinel="1" hidden/);
assert.match(boards,/tagName==='BUTTON'/);
assert.match(boards,/replaceWith/);
assert.match(boards,/list&&list\.hidden/);
assert.match(boards,/localStorage\.removeItem\('bvGameCatalogCollapsed'\)/);
for(const [i,script] of scripts(boards).entries())new vm.Script(script,{filename:`boards-v026-${i}.js`});

const entry=await readFile(new URL("../src/index-v025.js",import.meta.url),"utf8");
for(const marker of ["./ui/page-parity-v026.js","enhanceV026Html","x-boardverse-ui-hotfix","v026","content-type","text/html"])assert.ok(entry.includes(marker),marker);
console.log("ui-parity-v026.test: PASS");
