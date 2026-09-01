import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { enhanceV029Html } from '../src/ui/page-parity-v029.js';
import { orderGoBotActions } from '../src/bot/go-policy.js';
function scripts(source){return [...String(source).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}
function compile(name,html){scripts(html).forEach((s,i)=>new vm.Script(s,{filename:`${name}-${i}.js`}))}
const card=enhanceV029Html('<!doctype html><html><head></head><body class="bv-card-page bv-card-room" data-room-id="ABC234"><div class="shell"><nav class="top"></nav><section class="hero"></section><div class="players"></div><section id="joinBox"></section><section id="readyBox"></section><div id="result"></div><div id="gameArea"><section></section><section></section><section></section></div></div></body></html>','/cards/ABC234');
for(const marker of ['boardverse-v029-room-card-singleplayer-style','.card:not(.uno):not(.back)','.card.red:not(.uno):not(.back)','.card.uno.R','.card.uno.Y','.card.uno.G','.card.uno.B','.card.uno.W','bvV029RoomTools','bvV029Share','bvV029Copy','navigator.share','safeRoomUrl','bvCardRoomGate','bvCardGateName','bvCardReturnPassword','bvCardWatch','加入觀戰','returnPassword:password','bv-card-spectator'])assert.ok(card.includes(marker),marker);compile('card-v029',card);
assert.match(card,/body\.bv-card-gated\.bv-card-room #gameArea\{display:none!important\}/);
assert.match(card,/body\.bv-card-spectator #gameArea>section:nth-child\(3\)\{display:none!important\}/);
const board=enhanceV029Html('<html><head></head><body><form id="createForm"><div class="fields"><label id="bvCreateFocusGuardField"><span>防切頁模式</span></label><div id="bvCreateFocusGuardAllowedField"></div></div></form></body></html>','/boards');
assert.match(board,/#createForm \.fields #bvCreateFocusGuardField,#createForm \.fields #bvCreateFocusGuardAllowedField\{grid-column:auto!important/);
assert.match(board,/@media\(max-width:720px\)\{#createForm \.fields #bvCreateFocusGuardField,#createForm \.fields #bvCreateFocusGuardAllowedField\{grid-column:1\/-1!important/);compile('board-v029',board);
const single=enhanceV029Html('<html><head></head><body class="bv-singleplayer-v025"><nav class="topbar"></nav><div class="single-layout"><section class="catalog"><details id="gameCatalog"><summary>棋類與變種</summary></details></section><aside class="setup"><div class="eyebrow"></div><h1></h1><p class="meta"></p><div id="levels"><button data-level="3">3</button></div><button id="new">開始</button></aside><main><div id="status"></div><div id="board"></div></main></div><select id="bvSingleLanguage"></select></body></html>','/singleplayer');
for(const marker of ['#new{display:none','bvV029AutoStart','setTimeout(function(){var n=$(\'#new\')','select#bvSingleLanguage'])assert.ok(single.includes(marker),marker);assert.ok(!single.includes('new MutationObserver'), 'v029 must not install a competing document-wide MutationObserver');assert.ok(!single.includes("set(title,tx('電腦對戰'"), 'v029 must not fight v025 translations');compile('single-v029',single);
const fresh={type:'go',size:9,board:Array(81).fill(null),turn:'W',moveNumber:3,consecutivePasses:0,rules:{mode:'standard'}};
assert.notEqual(orderGoBotActions(fresh,{side:'W'},[{r:4,c:4},{action:'pass'}],5)[0].action,'pass');
const afterPass={...fresh,consecutivePasses:1};assert.equal(orderGoBotActions(afterPass,{side:'W'},[{r:4,c:4},{action:'pass'}],5)[0].action,'pass');
const settled={type:'go',size:3,board:['B','B','B','B',null,'B','B','B','B'],turn:'B',moveNumber:8,consecutivePasses:0,rules:{mode:'standard'}};assert.equal(orderGoBotActions(settled,{side:'B'},[{r:1,c:1},{action:'pass'}],5)[0].action,'pass');
const capture={...afterPass,rules:{mode:'capture'}};assert.deepEqual(orderGoBotActions(capture,{side:'W'},[{r:4,c:4},{action:'pass'}],5),[{r:4,c:4},{action:'pass'}]);
const session=await readFile(new URL('../src/bot/session-v029.js',import.meta.url),'utf8');for(const marker of ['orderGoBotActions','game?.type==="go"','{action:"pass"}'])assert.ok(session.includes(marker),marker);
const routes=await readFile(new URL('../src/bot/routes.js',import.meta.url),'utf8');assert.match(routes,/from "\.\/session-v029\.js"/);
const entry=await readFile(new URL('../src/index-v025.js',import.meta.url),'utf8');for(const marker of ['./ui/page-parity-v029.js','enhanceV029Html','x-boardverse-ui-hotfix","v029'])assert.ok(entry.includes(marker),marker);
console.log('ui-bot-v029.test: PASS');
