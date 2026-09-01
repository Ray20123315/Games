import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { enhanceCardRulesV031 } from '../src/ui/card-rules-v031.js';

function scripts(source){return [...String(source).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}
function compile(name,html){scripts(html).forEach((s,i)=>new vm.Script(s,{filename:`${name}-${i}.js`}))}

const lobby=enhanceCardRulesV031('<!doctype html><html><head></head><body class="bv-card-page bv-card-lobby"><div id="bvCardCatalogList"></div><select id="bvCardLanguage"></select></body></html>','/cards');
for(const marker of [
  'boardverse-card-rules-v031-style','boardverse-card-rules-v031-script','bv-card-rule-btn','詳細了解規則設定','Rules & win conditions',
  '德州撲克','五張抽牌撲克','UNO 相容玩法','瘋狂八點','牌型大小（由大到小）',
  '同花順','四條','葫蘆','同花','順子','三條','兩對','一對','高牌',
  'A-K-Q-J-10','A-2-3-4-5','共同勝者','花色本身沒有大小',
  '每人起手 7 張','萬用抽四','罰抽 2 張','沒有實作官方累積 500 分',
  '2 人時每人起手 7 張','3～6 人時每人起手 5 張','任何 8 都是萬用牌'
])assert.ok(lobby.includes(marker),marker);
assert.ok(!lobby.includes("observe(document.documentElement"),'v031 must not install a document-wide MutationObserver');
assert.ok(lobby.includes("o.observe(list,{childList:true})"),'catalog observer must be scoped to catalog list only');
compile('card-rules-v031-lobby',lobby);

const room=enhanceCardRulesV031('<!doctype html><html><head></head><body class="bv-card-page bv-card-room" data-room-id="ABC234"><div id="bvV029RoomTools"></div><div id="gt">德州撲克</div></body></html>','/cards/ABC234');
for(const marker of ['bvCardRoomRules','roomGameId','/api/card-rooms/','poker_holdem'])assert.ok(room.includes(marker),marker);
compile('card-rules-v031-room',room);

const untouched=enhanceCardRulesV031('<html><head></head><body></body></html>','/boards');
assert.ok(!untouched.includes('boardverse-card-rules-v031-script'));

const poker=await readFile(new URL('../src/cards/poker.js',import.meta.url),'utf8');
assert.match(poker,/const NAMES=\["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush"\]/);
assert.match(poker,/bestPokerHand\(\[\.\.\.g\.hands\[id\],\.\.\.g\.board\]\)/);
assert.match(poker,/if\(active\.length===1\)\{g\.phase="finished";g\.result=\{winnerIds:active,byFold:true/);

const shedding=await readFile(new URL('../src/cards/shedding.js',import.meta.url),'utf8');
assert.match(shedding,/dealRoundRobin\(drawPile,players,7\)/);
assert.match(shedding,/if\(remaining===1&&!a\.uno\)\{drawUno\(g,id,2\)/);
assert.match(shedding,/if\(remaining===0\)\{g\.phase="finished";g\.result=\{winnerIds:\[id\]\}/);
assert.match(shedding,/players\.length===2\?7:5/);
assert.match(shedding,/c\.rank===8\|\|c\.suit===g\.currentSuit\|\|c\.rank===top\.rank/);

const entry=await readFile(new URL('../src/index-v025.js',import.meta.url),'utf8');
for(const marker of ['./ui/card-rules-v031.js','enhanceCardRulesV031','x-boardverse-ui-hotfix","v031'])assert.ok(entry.includes(marker),marker);

console.log('card-rules-v031.test: PASS');
