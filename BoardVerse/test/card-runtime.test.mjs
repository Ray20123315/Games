import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { cardPortalPage, injectCardHomeEntry } from "../src/cards/page.js";
import { injectCardBoardParity } from "../src/ui/card-board-parity.js";

function scripts(source) {
  return [...String(source).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter(Boolean);
}

for (const [name, page] of [["lobby", cardPortalPage()], ["room", cardPortalPage("ABC234")]]) {
  const found = scripts(page);
  assert.equal(found.length, 1, name);
  new vm.Script(found[0], { filename: `card-${name}.js` });
  assert.match(page, /BOARD<b>VERSE<\/b> · CARDS/);
  if (name === "lobby") assert.match(page, /私有手牌/);
  else {
    assert.match(page, /你的手牌/);
    assert.match(page, /其他玩家/);
  }
}

const parity = injectCardBoardParity(cardPortalPage());
assert.match(parity, /boardverse-card-board-parity-style/);
assert.match(parity, /boardverse-card-board-parity-script/);
assert.match(parity, /bv-card-catalog game-catalog/);
assert.match(parity, /bvCardCatalogDetails/);
assert.match(parity, /bvCardCatalogCollapsed/);
assert.match(parity, /game-list/);
assert.match(parity, /game-card/);
assert.match(parity, /app-frame/);
assert.match(parity, /topbar/);
assert.match(parity, /\/api\/card-games/);
assert.match(parity, /bvCardLanguage/);
assert.match(parity, /boardverseLang/);
assert.match(parity, /bv-card-face/);
assert.match(parity, /bvCardSafetyNote/);
assert.match(parity, /pendingGame/);
assert.match(parity, /applyPending/);
assert.match(parity, /bvCardParityBound/);
assert.match(parity, /localizedGameText/);
assert.match(parity, /best five-card hand wins/);
assert.match(parity, /Cancel ready/);
assert.match(parity, /Playing-card faces are game content/);
assert.equal(injectCardBoardParity(parity), parity, "card parity injection must be idempotent");
const parityScripts = scripts(parity);
assert.equal(parityScripts.length, 2);
for (const [i, script] of parityScripts.entries()) new vm.Script(script, { filename: `card-parity-${i}.js` });

const injected = injectCardHomeEntry('<html><body><div id="bvSafeHome"><div class="bv-home-cta"></div><div id="bvHomeGrid"></div></div></body></html>');
assert.match(injected, /boardverse-card-home-entry/);
new vm.Script(scripts(injected)[0]);
assert.match(injected, /\/cards/);

const entry = await readFile(new URL("../src/index-v024.js", import.meta.url), "utf8");
for (const marker of [
  "handleCardRoutes",
  'export { GameRoom } from "./cards/do-room.js"',
  "appV023.fetch",
  "injectCardBoardParity",
  'path==="/cards"||path.startsWith("/cards/")',
]) assert.ok(entry.includes(marker), marker);

const routes = await readFile(new URL("../src/cards/routes.js", import.meta.url), "utf8");
for (const marker of ["LOBBY_NAME", "/api/card-games", "/api/card-rooms", "ws\\/cards", "createD1CardRoom", "listD1CardRooms"]) assert.ok(routes.includes(marker), marker);

const room = await readFile(new URL("../src/cards/do-room.js", import.meta.url), "utf8");
for (const marker of ["ROOM_KEY", "LOBBY_NAME", "new WebSocketPair()", 'serializeAttachment({kind:"card",token})', "publicCardRoom(room,a.token", "cardMessage"]) assert.ok(room.includes(marker), marker);

console.log("card-runtime.test: PASS");
