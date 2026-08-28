import { readFile, writeFile } from "node:fs/promises";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");

function replaceExact(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.replace(from, to);
}
function insertBefore(marker, text, label) {
  const i = source.indexOf(marker);
  if (i < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(marker, i + marker.length) >= 0) throw new Error(`${label} marker not unique`);
  source = source.slice(0, i) + text + source.slice(i);
}
function blockRange(marker, label) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${label} marker not found`);
  if (source.indexOf(marker, start + marker.length) >= 0) throw new Error(`${label} marker not unique`);
  const open = source.indexOf("{", start + marker.length - 1);
  if (open < 0) throw new Error(`${label} opening brace not found`);
  let depth = 0, quote = "", esc = false, line = false, block = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i], nx = source[i + 1];
    if (line) { if (ch === "\n") line = false; continue; }
    if (block) { if (ch === "*" && nx === "/") { block = false; i++; } continue; }
    if (quote) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "/" && nx === "/") { line = true; i++; continue; }
    if (ch === "/" && nx === "*") { block = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return [start, i + 1];
    }
  }
  throw new Error(`${label} closing brace not found`);
}
function replaceBlock(marker, replacement, label) {
  const [a, b] = blockRange(marker, label);
  source = source.slice(0, a) + replacement + source.slice(b);
}
function mutateBlock(marker, mutator, label) {
  const [a, b] = blockRange(marker, label);
  const old = source.slice(a, b);
  const next = mutator(old);
  if (next === old) throw new Error(`${label} mutation made no change`);
  source = source.slice(0, a) + next + source.slice(b);
}
function replaceCount(from, to, expected, label) {
  let count = 0, at = 0;
  while ((at = source.indexOf(from, at)) >= 0) { count++; at += from.length; }
  if (count !== expected) throw new Error(`${label} expected ${expected}, got ${count}`);
  source = source.split(from).join(to);
}

replaceExact('const APP_VERSION = "0.0.23";', 'const APP_VERSION = "0.0.24";', 'version');

insertBefore('const RULE_DEFS = {', `GAME_CATALOG.banqi = {\n  id: "banqi",\n  family: "banqi",\n  title: "暗棋（翻棋）",\n  short: "4×8 翻棋",\n  description: "32 子洗牌蓋牌；第一顆翻出的棋決定雙方紅黑，之後輪流翻子、走子與吃子。",\n};\nGAME_CATALOG.xiangqi_random = {\n  id: "xiangqi_random",\n  family: "xiangqi",\n  title: "象棋・隨機布局",\n  short: "合法底線洗牌",\n  description: "底線棋子在保留將帥／士仕九宮限制下隨機洗牌；炮與兵卒維持標準位置。",\n};\n\n`, 'game catalog variants');

replaceExact('};\n\nfunction gameFamily(gameId) { return GAME_CATALOG[gameId]?.family || ""; }', `};\n\nconst SIDE_MODE_CONFIG = {\n  go: { default:"guess", options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]] },\n  gomoku: { default:"guess", options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]] },\n  renju: { default:"guess", options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]] },\n  xiangqi: { default:"random", options:[["random","隨機抽籤"],["manual","玩家協議"]] },\n  chess: { default:"hidden", options:[["hidden","雙手藏棋"],["random","隨機抽籤"],["manual","玩家協議"]] },\n  reversi: { default:"random", options:[["guess","猜單雙"],["random","隨機抽籤"],["manual","玩家協議"]] },\n};\nfor (const [family, cfg] of Object.entries(SIDE_MODE_CONFIG)) {\n  RULE_DEFS[family].defaults.sideMode = cfg.default;\n  RULE_DEFS[family].fields.push({\n    key:"sideMode", label:"猜先／分色方式", type:"select", options:cfg.options,\n    help:"決定本局雙方持色。猜單雙與雙手藏棋會先完成互動流程；隨機抽籤由伺服器直接分配；玩家協議則由玩家 A 在討論後選定自己的顏色。"\n  });\n}\nRULE_DEFS.banqi = {\n  defaults:{}, fields:[],\n  extraHelp:"暗棋 32 子洗牌後全部蓋牌。玩家 A 先翻一子；第一顆翻出的棋子顏色就是玩家 A 的持色，另一方自動取得另一色。"\n};\n\nfunction gameFamily(gameId) { return GAME_CATALOG[gameId]?.family || ""; }`, 'side mode rule fields');

mutateBlock('function normalizeRules(gameId, input = {}) {', (block) => block.replace(
  '  return out;\n}',
  `  const sideCfg = SIDE_MODE_CONFIG[family];\n  if (sideCfg && sideCfg.options.some((o) => o[0] === src.sideMode)) out.sideMode = src.sideMode;\n  return out;\n}`
), 'normalizeRules side mode');

replaceExact(`function sideFor(gameId, seat) {\n  if (gameId === "chess") return seat === 0 ? "W" : "B";\n  if (gameId === "xiangqi") return seat === 0 ? "R" : "B";\n  return seat === 0 ? "B" : "W";\n}`, `function sideFor(gameId, seat) {\n  if (gameId === "chess") return seat === 0 ? "W" : "B";\n  if (gameId === "xiangqi" || gameId === "xiangqi_random" || gameId === "banqi") return seat === 0 ? "R" : "B";\n  return seat === 0 ? "B" : "W";\n}\nfunction openingOtherSide(gameId, side) {\n  if (gameId === "chess") return side === "W" ? "B" : "W";\n  if (gameId === "xiangqi" || gameId === "xiangqi_random" || gameId === "banqi") return side === "R" ? "B" : "R";\n  return side === "B" ? "W" : "B";\n}\nfunction openingFirstSide(gameId) { return sideFor(gameId, 0); }\nfunction secureRandomInt(max) {\n  const a = crypto.getRandomValues(new Uint32Array(1));\n  return max > 0 ? a[0] % max : 0;\n}\nfunction secureShuffle(values) {\n  const out = values.slice();\n  for (let i = out.length - 1; i > 0; i--) {\n    const j = secureRandomInt(i + 1);\n    [out[i], out[j]] = [out[j], out[i]];\n  }\n  return out;\n}\nfunction assignOpeningSides(room, memberId, chosenSide = openingFirstSide(room.gameId)) {\n  const a = seatMember(room, 0), b = seatMember(room, 1);\n  const chosen = roomMemberById(room, memberId);\n  if (!a || !b || !chosen || !room.seats.includes(chosen.id)) return false;\n  const other = chosen.id === a.id ? b : a;\n  chosen.side = chosenSide;\n  other.side = openingOtherSide(room.gameId, chosenSide);\n  chosen.updatedAt = other.updatedAt = Date.now();\n  if (room.opening) { room.opening.resolved = true; room.opening.phase = "done"; }\n  return true;\n}\nfunction publicOpening(room) {\n  const o = room?.opening;\n  if (!o) return null;\n  const name = (id) => roomMemberById(room, id)?.name || null;\n  return {\n    mode:o.mode || "", phase:o.phase || "", resolved:!!o.resolved,\n    holderId:o.holderId || null, holderName:name(o.holderId),\n    actorId:o.actorId || null, actorName:name(o.actorId),\n    chooserId:o.chooserId || null, chooserName:name(o.chooserId),\n    guessRule:o.guessRule || null,\n  };\n}\nfunction visibleMemberSide(room, member) {\n  return room?.opening && !room.opening.resolved ? null : member?.side || null;\n}\nfunction publicMemberForRoom(room, member) {\n  const out = publicMember(member);\n  if (out) out.side = visibleMemberSide(room, member);\n  return out;\n}`, 'side helpers');

insertBefore('function newXiangqi(', `function newBanqi(rules = {}) {\n  const pieces = [];\n  for (const color of ["r","b"]) {\n    pieces.push(color+"K");\n    pieces.push(color+"A", color+"A", color+"E", color+"E", color+"R", color+"R", color+"H", color+"H", color+"C", color+"C");\n    for (let i = 0; i < 5; i++) pieces.push(color+"P");\n  }\n  return {\n    type:"banqi", rows:4, cols:8, board:secureShuffle(pieces), covered:Array(32).fill(true),\n    assigned:false, turnSeat:0, turn:null, moveNumber:0, ended:false, result:null, lastMove:null, rules:structuredClone(rules || {}),\n  };\n}\nfunction banqiColor(piece) { return piece?.[0] === "r" ? "R" : "B"; }\nfunction banqiRank(piece) { return ({K:7,A:6,E:5,R:4,H:3,C:2,P:1})[piece?.[1]] || 0; }\nfunction banqiCanRankCapture(a, d) {\n  if (!a || !d) return false;\n  if (a[1] === "K" && d[1] === "P") return false;\n  if (a[1] === "P" && d[1] === "K") return true;\n  return banqiRank(a) >= banqiRank(d);\n}\nfunction banqiRC(i) { return [Math.floor(i / 8), i % 8]; }\nfunction banqiAdjacent(a, b) { const [ar,ac]=banqiRC(a), [br,bc]=banqiRC(b); return Math.abs(ar-br)+Math.abs(ac-bc)===1; }\nfunction banqiScreens(game, from, to) {\n  const [fr,fc]=banqiRC(from), [tr,tc]=banqiRC(to);\n  if (fr !== tr && fc !== tc) return -1;\n  let count=0;\n  if (fr===tr) for(let c=Math.min(fc,tc)+1;c<Math.max(fc,tc);c++) if(game.board[fr*8+c]) count++;\n  else for(let r=Math.min(fr,tr)+1;r<Math.max(fr,tr);r++) if(game.board[r*8+fc]) count++;\n  return count;\n}\nfunction banqiLegalFromTo(game, side, from, to) {\n  if (!Number.isInteger(from) || !Number.isInteger(to) || from<0 || from>=32 || to<0 || to>=32 || from===to) return false;\n  const piece=game.board[from];\n  if (!piece || game.covered[from] || banqiColor(piece)!==side) return false;\n  const target=game.board[to];\n  if (!target) return banqiAdjacent(from,to);\n  if (piece[1]==="C") {\n    if (banqiScreens(game,from,to)!==1) return false;\n    return game.covered[to] || banqiColor(target)!==side;\n  }\n  if (game.covered[to] || banqiColor(target)===side || !banqiAdjacent(from,to)) return false;\n  return banqiCanRankCapture(piece,target);\n}\nfunction banqiHasLegal(game, side) {\n  if (game.covered.some((v,i)=>v && game.board[i])) return true;\n  for (let from=0; from<32; from++) {\n    const p=game.board[from];\n    if (!p || game.covered[from] || banqiColor(p)!==side) continue;\n    for (let to=0; to<32; to++) if (banqiLegalFromTo(game,side,from,to)) return true;\n  }\n  return false;\n}\nfunction applyBanqi(game, side, msg) {\n  const g=structuredClone(game);\n  if (g.ended) return {ok:false,error:"棋局已結束"};\n  const seat=Number(msg?.seat);\n  if (![0,1].includes(seat)) return {ok:false,error:"缺少玩家席位"};\n  const r=Number(msg?.r), c=Number(msg?.c);\n  if (Number.isInteger(r) && Number.isInteger(c)) {\n    const idx=r*8+c;\n    if (r<0||r>=4||c<0||c>=8||!g.board[idx]||!g.covered[idx]) return {ok:false,error:"此處不能翻子"};\n    if (!g.assigned && seat!==g.turnSeat) return {ok:false,error:"還沒輪到你翻第一子"};\n    if (g.assigned && side!==g.turn) return {ok:false,error:"還沒輪到你"};\n    g.covered[idx]=false;\n    g.moveNumber=(g.moveNumber||0)+1;\n    g.lastMove={r,c,flip:true};\n    let assignedSide=null;\n    if (!g.assigned) {\n      assignedSide=banqiColor(g.board[idx]);\n      g.assigned=true;\n      g.turn=openingOtherSide("banqi",assignedSide);\n    } else g.turn=openingOtherSide("banqi",side);\n    g.turnSeat=1-seat;\n    return {ok:true,game:g,assignedSide};\n  }\n  const from=Number(msg?.from), to=Number(msg?.to);\n  if (!g.assigned || side!==g.turn) return {ok:false,error:"尚未完成暗棋分色"};\n  if (!banqiLegalFromTo(g,side,from,to)) return {ok:false,error:"暗棋走法或吃子不合法"};\n  const captured=g.board[to];\n  g.board[to]=g.board[from]; g.covered[to]=false;\n  g.board[from]=null; g.covered[from]=false;\n  g.moveNumber=(g.moveNumber||0)+1;\n  g.lastMove={from,to,capture:!!captured};\n  const enemy=openingOtherSide("banqi",side);\n  const enemyPieces=g.board.some((p)=>p && banqiColor(p)===enemy);\n  if (!enemyPieces || !banqiHasLegal(g,enemy)) {\n    g.ended=true; g.result={winner:side,reason:"capture",text:(side==="R"?"紅方":"黑方")+"獲勝"};\n  } else { g.turn=enemy; g.turnSeat=1-seat; }\n  return {ok:true,game:g};\n}\nfunction newXiangqiRandom(rules = {}) {\n  const g = newXiangqi(rules);\n  const topOuter=secureShuffle(["bR","bH","bE","bE","bH","bR"]), topPalace=secureShuffle(["bA","bK","bA"]);\n  const botOuter=secureShuffle(["rR","rH","rE","rE","rH","rR"]), botPalace=secureShuffle(["rA","rK","rA"]);\n  [0,1,2,6,7,8].forEach((c,i)=>g.board[c]=topOuter[i]); [3,4,5].forEach((c,i)=>g.board[c]=topPalace[i]);\n  [0,1,2,6,7,8].forEach((c,i)=>g.board[81+c]=botOuter[i]); [3,4,5].forEach((c,i)=>g.board[81+c]=botPalace[i]);\n  g.variant="random_backrank";\n  return g;\n}\n\n`, 'banqi and random xiangqi engine');

mutateBlock('function newGame(gameId, rulesInput = {}) {', (block) => block.replace(
  '  if (gameId === "xiangqi") return newXiangqi(rules);',
  '  if (gameId === "xiangqi") return newXiangqi(rules);\n  if (gameId === "xiangqi_random") return newXiangqiRandom(rules);\n  if (gameId === "banqi") return newBanqi(rules);'
), 'newGame variants');

mutateBlock('function applyGameAction(game, side, msg) {', (block) => block.replace(
  '  if (game.type === "xiangqi") return applyXiangqi(game, side, msg);',
  '  if (game.type === "xiangqi") return applyXiangqi(game, side, msg);\n  if (game.type === "banqi") return applyBanqi(game, side, msg);'
), 'applyGameAction banqi');

mutateBlock('function publicGameState(game) {', (block) => {
  const needle='  const out = structuredClone(game);';
  if (!block.includes(needle)) throw new Error('publicGameState clone marker missing');
  return block.replace(needle, `${needle}\n  if (out?.type === "banqi" && Array.isArray(out.covered)) {\n    for (let i=0;i<out.board.length;i++) if (out.covered[i] && out.board[i]) out.board[i] = "?";\n  }`);
}, 'publicGameState banqi masking');

replaceExact('      createdAt: now,\n      updatedAt: now,\n      ownerId: owner.id,', '      createdAt: now,\n      updatedAt: now,\n      startedAt: null,\n      endedAt: null,\n      opening: null,\n      ownerId: owner.id,', 'room time initialization');

mutateBlock('function migrateRoomState(room) {', (block) => {
  let out=block;
  const anchor='  if (!Array.isArray(room.replays)) { room.replays = []; changed = true; }';
  if (!out.includes(anchor)) throw new Error('migration replay anchor missing');
  out=out.replace(anchor, `  if (!("startedAt" in room)) { room.startedAt = room.status === "playing" ? Number(room.currentReplay?.startedAt || room.updatedAt || room.createdAt || Date.now()) : null; changed = true; }\n  if (!("endedAt" in room)) { room.endedAt = room.status === "finished" ? Number(room.updatedAt || Date.now()) : null; changed = true; }\n  if (!("opening" in room)) { room.opening = room.status === "playing" ? {mode:"legacy",phase:"done",resolved:true} : null; changed = true; }\n${anchor}`);
  out=out.replace('initialGame:publicGameState(room.game)', 'initialGame:structuredClone(room.game)');
  return out;
}, 'migrate room v024');

mutateBlock('function sanitizeLobbyRecord(', (block) => {
  const m=block.match(/function sanitizeLobbyRecord\((\w+)/);
  if (!m) throw new Error('sanitizeLobbyRecord arg missing');
  const v=m[1];
  if (block.includes('startedAt:')) return block;
  const re=/(\n\s*createdAt\s*:\s*[^\n]+\n)/;
  if (!re.test(block)) throw new Error('sanitizeLobbyRecord createdAt field missing');
  return block.replace(re, `$1      startedAt: Number(${v}.startedAt) || null,\n      endedAt: Number(${v}.endedAt) || null,\n`);
}, 'sanitize lobby timing');

mutateBlock('  lobbyRecord() {', (block) => {
  if (block.includes('startedAt: this.room.startedAt')) return block;
  const needle='      createdAt: this.room.createdAt,';
  if (!block.includes(needle)) throw new Error('lobbyRecord createdAt marker missing');
  return block.replace(needle, `${needle}\n      startedAt: Number(this.room.startedAt) || null,\n      endedAt: Number(this.room.endedAt) || null,`);
}, 'lobby record timing');

replaceBlock('  maybeStartMatch() {', `  maybeStartMatch() {\n    const room = this.room;\n    if (!room || room.status === "playing") return false;\n    const a = seatMember(room, 0), b = seatMember(room, 1);\n    if (!a || !b) return false;\n    a.role = "player"; b.role = "player";\n    a.side = sideFor(room.gameId, 0); b.side = sideFor(room.gameId, 1);\n    room.game = newGame(room.gameId, room.rules);\n    room.status = "playing";\n    room.result = null;\n    room.rematchVotes = [];\n    room.matchSeq = (Number(room.matchSeq) || 0) + 1;\n    room.startedAt = Date.now();\n    room.endedAt = null;\n    room.currentReplay = null;\n    if (room.gameId === "banqi") {\n      room.opening = {mode:"first_flip",phase:"banqi",resolved:false,actorId:a.id};\n      this.startReplay();\n      return true;\n    }\n    const mode = room.rules?.sideMode || SIDE_MODE_CONFIG[gameFamily(room.gameId)]?.default || "random";\n    if (mode === "random") {\n      room.opening = {mode:"random",phase:"done",resolved:true};\n      const first = secureRandomInt(2) === 0 ? a : b;\n      assignOpeningSides(room, first.id, openingFirstSide(room.gameId));\n      this.startReplay();\n    } else if (mode === "guess") {\n      room.opening = {\n        mode:"guess", phase:"guess", resolved:false, holderId:a.id, actorId:b.id,\n        secretParity:secureRandomInt(2)===0?"odd":"even",\n        guessRule:gameFamily(room.gameId)==="go"?"direct_first":"winner_chooses",\n      };\n    } else if (mode === "hidden") {\n      const first=openingFirstSide(room.gameId), other=openingOtherSide(room.gameId,first);\n      const swap=secureRandomInt(2)===1;\n      room.opening={mode:"hidden",phase:"hand",resolved:false,holderId:a.id,actorId:b.id,leftSide:swap?other:first,rightSide:swap?first:other};\n    } else {\n      room.opening={mode:"manual",phase:"choose",resolved:false,chooserId:a.id};\n    }\n    return true;\n  }`, 'maybeStartMatch opening');

replaceCount('initialGame:publicGameState(room.game)', 'initialGame:structuredClone(room.game)', 1, 'startReplay hidden-state source');

mutateBlock('function sanitizeReplayMove(', (block) => {
  const needle='  for (const key of ["r","c","from","to"])';
  if (!block.includes(needle)) throw new Error('sanitizeReplayMove keys marker missing');
  return block.replace(needle, '  for (const key of ["r","c","from","to","seat"])');
}, 'replay seat');

mutateBlock('  roomView(token) {', (block) => {
  let out=block;
  out=out.replace('host: publicMember(host)', 'host: publicMemberForRoom(this.room, host)');
  out=out.replace('guest: publicMember(guest)', 'guest: publicMemberForRoom(this.room, guest)');
  out=out.replace('mySide: member?.side || null,', 'mySide: visibleMemberSide(this.room, member),\n      mySeat: member ? this.room.seats.indexOf(member.id) : -1,');
  const statusNeedle='      status: this.room.status,';
  if (!out.includes(statusNeedle)) throw new Error('roomView status marker missing');
  out=out.replace(statusNeedle, `${statusNeedle}\n      createdAt: Number(this.room.createdAt) || null,\n      startedAt: Number(this.room.startedAt) || null,\n      endedAt: Number(this.room.endedAt) || null,`);
  const swapNeedle='      canSwap:';
  const idx=out.indexOf(swapNeedle);
  if(idx<0) throw new Error('roomView canSwap marker missing');
  const lineEnd=out.indexOf('\n',idx);
  out=out.slice(0,lineEnd+1)+'      opening: publicOpening(this.room),\n'+out.slice(lineEnd+1);
  return out;
}, 'room view opening and timing');

insertBefore('  async handleMove(token, msg) {', `  async handleOpeningGuess(token, msg) {\n    const auth=this.authPlayer(token);\n    if (!auth.ok) return this.sendError(auth.ws, auth.error);\n    const room=this.room, o=room.opening;\n    if (!o || o.resolved || o.phase!=="guess" || auth.member.id!==o.actorId) return this.sendError(auth.ws,"目前不能猜單雙");\n    const guess=msg?.guess==="odd"?"odd":msg?.guess==="even"?"even":null;\n    if (!guess) return this.sendError(auth.ws,"請選擇單數或雙數");\n    const correct=guess===o.secretParity;\n    delete o.secretParity;\n    if (o.guessRule==="direct_first") {\n      const firstId=correct?o.actorId:o.holderId;\n      assignOpeningSides(room,firstId,openingFirstSide(room.gameId));\n      this.startReplay();\n    } else {\n      o.phase="choose"; o.chooserId=correct?o.actorId:o.holderId;\n    }\n    this.markChanged(); await this.persist(); this.broadcastState();\n  }\n\n  async handleOpeningChoose(token, msg) {\n    const auth=this.authPlayer(token);\n    if (!auth.ok) return this.sendError(auth.ws, auth.error);\n    const room=this.room, o=room.opening;\n    if (!o || o.resolved || o.phase!=="choose" || auth.member.id!==o.chooserId) return this.sendError(auth.ws,"目前不能選擇持色");\n    const first=openingFirstSide(room.gameId), other=openingOtherSide(room.gameId,first), side=String(msg?.side||"");\n    if (side!==first && side!==other) return this.sendError(auth.ws,"持色無效");\n    assignOpeningSides(room,auth.member.id,side);\n    this.startReplay();\n    this.markChanged(); await this.persist(); this.broadcastState();\n  }\n\n  async handleOpeningHand(token, msg) {\n    const auth=this.authPlayer(token);\n    if (!auth.ok) return this.sendError(auth.ws, auth.error);\n    const room=this.room, o=room.opening;\n    if (!o || o.resolved || o.phase!=="hand" || auth.member.id!==o.actorId) return this.sendError(auth.ws,"目前不能選手");\n    const hand=msg?.hand==="left"?"left":msg?.hand==="right"?"right":null;\n    if (!hand) return this.sendError(auth.ws,"請選左手或右手");\n    const side=hand==="left"?o.leftSide:o.rightSide;\n    delete o.leftSide; delete o.rightSide;\n    assignOpeningSides(room,auth.member.id,side);\n    this.startReplay();\n    this.markChanged(); await this.persist(); this.broadcastState();\n  }\n\n`, 'opening handlers');

mutateBlock('  async webSocketMessage(ws, message) {', (block) => {
  const needle='      if (msg.type === "move")';
  if (!block.includes(needle)) throw new Error('webSocket move dispatch marker missing');
  return block.replace(needle, `      if (msg.type === "opening_guess") return this.handleOpeningGuess(token, msg);\n      if (msg.type === "opening_choose") return this.handleOpeningChoose(token, msg);\n      if (msg.type === "opening_hand") return this.handleOpeningHand(token, msg);\n${needle}`);
}, 'websocket opening dispatch');

replaceBlock('  async handleMove(token, msg) {', `  async handleMove(token, msg) {\n    const auth = this.authPlayer(token);\n    if (!auth.ok) return this.sendError(auth.ws, auth.error);\n    const room = this.room;\n    if (room.status !== "playing") return this.sendError(auth.ws, "棋局尚未開始");\n    if (room.opening && !room.opening.resolved && room.gameId !== "banqi") return this.sendError(auth.ws, "猜先／分色尚未完成");\n    if (room.gameId === "banqi") {\n      const seat=room.seats.indexOf(auth.member.id);\n      if (seat<0) return this.sendError(auth.ws,"你不在玩家席位");\n      if (!room.game.assigned) { if (room.game.turnSeat!==seat) return this.sendError(auth.ws,"還沒輪到你翻第一子"); }\n      else if (room.game.turn!==auth.member.side) return this.sendError(auth.ws,"還沒輪到你");\n      const action={...msg,seat};\n      const next=applyGameAction(room.game,auth.member.side,action);\n      if (!next.ok) return this.sendError(auth.ws,next.error || "走法不合法");\n      room.game=next.game;\n      this.recordReplayAction(auth.member.side,action);\n      if (next.assignedSide && room.opening && !room.opening.resolved) {\n        assignOpeningSides(room,auth.member.id,next.assignedSide);\n        if (room.currentReplay) room.currentReplay.players=room.seats.map((id)=>roomMemberById(room,id)).filter(Boolean).map((m)=>({memberId:m.id,name:m.name,side:m.side}));\n      }\n      if (next.game.ended) this.finishMatch(next.game.result);\n      else { this.markChanged(); this.persist().then(()=>this.broadcastState()); }\n      return;\n    }\n    if (room.game.turn !== auth.member.side) return this.sendError(auth.ws, "還沒輪到你");\n    const next = applyGameAction(room.game, auth.member.side, msg);\n    if (!next.ok) return this.sendError(auth.ws, next.error || "走法不合法");\n    room.game = next.game;\n    this.recordReplayAction(auth.member.side, msg);\n    if (next.game.ended) this.finishMatch(next.game.result);\n    else { this.markChanged(); this.persist().then(() => this.broadcastState()); }\n  }`, 'handleMove opening and banqi');

mutateBlock('  async handlePass(token', (block) => {
  const needle='    const room = this.room;';
  if(!block.includes(needle)) throw new Error('handlePass room marker missing');
  return block.replace(needle, `${needle}\n    if (room.opening && !room.opening.resolved) return this.sendError(auth.ws, "猜先／分色尚未完成");`);
}, 'handlePass opening guard');

mutateBlock('  async handleResign(token', (block) => {
  const needle='    const room = this.room;';
  if(!block.includes(needle)) throw new Error('handleResign room marker missing');
  return block.replace(needle, `${needle}\n    if (room.opening && !room.opening.resolved) return this.sendError(auth.ws, "猜先／分色尚未完成");`);
}, 'handleResign opening guard');

mutateBlock('  finishMatch(result) {', (block) => {
  const needle='    room.status = "finished";';
  if(!block.includes(needle)) throw new Error('finishMatch status marker missing');
  return block.replace(needle, `${needle}\n    room.endedAt = Date.now();`);
}, 'finish match end time');

replaceExact('</style>', `.opening-box{margin-top:9px;padding:10px;border:1px solid #5b4930;border-radius:10px;background:#17140d;font-size:12px;line-height:1.5}.opening-box .actions{margin-top:8px}.banqi-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(4,1fr);background:#b9874f;border:5px solid #6c431e;border-radius:8px;overflow:hidden}.banqi-board .sq{background:#c69a61;border:1px solid #7b5229}.banqi-back{width:78%;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 28%,#8c633d 0,#4f321f 55%,#28180e 100%);border:2px solid #b99261;color:#e4c99c;font-weight:900;font-family:serif;box-shadow:0 2px 5px rgba(0,0,0,.45)}\n</style>`, 'v024 css');

replaceExact('<div id="roleInfo" class="role-line"></div><label id="lastMoveMarkerSetting"', '<div id="roleInfo" class="role-line"></div><div id="openingBox" class="opening-box hidden"><div id="openingText"></div><div id="openingActions" class="actions"></div></div><label id="lastMoveMarkerSetting"', 'opening ui container');

replaceExact('};\nvar I18N={', `};\nGAMES.banqi={zhHant:["暗棋（翻棋）","4×8 翻棋"],zhHans:["暗棋（翻棋）","4×8 翻棋"],en:["Banqi (Dark Chess)","4×8 Chinese Dark Chess"]};\nGAMES.xiangqi_random={zhHant:["象棋・隨機布局","合法底線洗牌"],zhHans:["象棋・随机布局","合法底线洗牌"],en:["Xiangqi · Random Setup","Legal back-rank shuffle"]};\nvar I18N={` , 'client game names');

replaceExact('};\nvar RULE_HELP_I18N={', `};\n["go","gomoku","renju","xiangqi","chess","reversi"].forEach(function(f){RULE_OPTION_I18N[f]=RULE_OPTION_I18N[f]||{};RULE_OPTION_I18N[f].sideMode={guess:["猜單雙","猜单双","Odd/even guess"],random:["隨機抽籤","随机抽签","Random draw"],manual:["玩家協議","玩家协商","Players decide"],hidden:["雙手藏棋","双手藏棋","Hidden hands"]}});\nvar RULE_HELP_I18N={` , 'client side mode options');

replaceExact('function helpTranslation(family,key,fallback){return ruleHelpText(family,key,fallback)}', `function helpTranslation(family,key,fallback){if(key==='sideMode')return lang==='en'?'Choose how colors are assigned before the match. Random draw is server-side; manual lets Player A choose after discussion; guess/hidden-hand modes require the shown opening interaction.':lang==='zh-Hans'?'决定开局前如何分配持色。随机抽签由服务器执行；玩家协商会由玩家 A 在讨论后选择；猜单双／双手藏棋需完成房间内互动。':'決定開局前如何分配持色。隨機抽籤由伺服器執行；玩家協議會由玩家 A 在討論後選擇；猜單雙／雙手藏棋需完成房間內互動。';return ruleHelpText(family,key,fallback)}`, 'client side mode help');

replaceExact('function fieldTranslation(family,key,kind,fallback){var map={', `function fieldTranslation(family,key,kind,fallback){if(key==='sideMode')return lang==='en'?'Opening colors':lang==='zh-Hans'?'猜先／分色方式':'猜先／分色方式';var map={` , 'client side mode label');

replaceBlock('function sideName(gameId,s){', `function sideName(gameId,s){if(!s)return lang==='en'?'Pending':lang==='zh-Hans'?'待分色':'待分色';if(gameId==='chess')return s==='W'?(lang==='en'?'White':lang==='zh-Hans'?'白方':'白方'):(lang==='en'?'Black':'黑方');if(gameId==='xiangqi'||gameId==='xiangqi_random'||gameId==='banqi')return s==='R'?(lang==='en'?'Red':lang==='zh-Hans'?'红方':'紅方'):(lang==='en'?'Black':'黑方');return s==='B'?(lang==='en'?'Black':'黑方'):(lang==='en'?'White':'白方')}`, 'client side names');

insertBefore('function makePublicRoomRow(r){', `function fmtRoomTime(ms){if(!ms)return lang==='en'?'—':'—';return new Date(ms).toLocaleString(lang==='en'?'en-US':lang==='zh-Hans'?'zh-CN':'zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}\nfunction fmtDuration(ms){if(!Number.isFinite(ms)||ms<0)return '—';var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(x).padStart(2,'0')}\nfunction roomTimingText(r){var dur=r.startedAt?Math.max(0,(r.endedAt||Date.now())-r.startedAt):null;if(lang==='en')return 'Created '+fmtRoomTime(r.createdAt)+' · Started '+fmtRoomTime(r.startedAt)+' · Duration '+fmtDuration(dur);if(lang==='zh-Hans')return '创建 '+fmtRoomTime(r.createdAt)+' · 开始 '+fmtRoomTime(r.startedAt)+' · 时长 '+fmtDuration(dur);return '建立 '+fmtRoomTime(r.createdAt)+' · 開始 '+fmtRoomTime(r.startedAt)+' · 時長 '+fmtDuration(dur)}\n`, 'room timing helpers');

replaceBlock('function makePublicRoomRow(r){', `function makePublicRoomRow(r){var row=document.createElement('div');row.className='room-row';var info=document.createElement('div');var a=document.createElement('strong');a.textContent=r.name+' · '+gameText(r.gameId,0);var b=document.createElement('div');b.className='small muted room-row-meta';b.textContent=r.id+' · '+statusText(r.status)+' · '+r.players+'/2'+(r.queueEnabled?' · '+t('queueCount')+' '+r.queueLength:'');var tm=document.createElement('div');tm.className='small muted room-row-meta';tm.textContent=roomTimingText(r);info.appendChild(a);info.appendChild(b);info.appendChild(tm);var btn=document.createElement('button');btn.className='btn secondary';btn.type='button';btn.textContent=t('open');btn.addEventListener('click',function(){openRoomGate(r.id)});row.appendChild(info);row.appendChild(btn);return row}`, 'public room timing ui');

replaceBlock('function renderRoom(){', `function renderRoom(){var r=roomState;if(!r)return;$('roomTitle').textContent=r.name;$('roomMeta').textContent=gameText(r.gameId,0)+' · '+(r.privateRoom?(lang==='en'?'Private':'私人房'):(lang==='en'?'Public':'公開房'))+' · '+statusText(r.status)+' · '+r.id+' · '+roomTimingText(r);renderPlayers(r);renderPending(r);renderQueue(r);renderStatus(r);renderReplays(r);renderChat(r);renderRules(r);renderBoard()}`, 'room timing ui');

insertBefore('function renderStatus(r){', `function openingSides(gameId){if(gameId==='chess')return['W','B'];if(gameId==='xiangqi'||gameId==='xiangqi_random'||gameId==='banqi')return['R','B'];return['B','W']}\nfunction openingPlayerName(r,id){var list=[r.players&&r.players.host,r.players&&r.players.guest];for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list[i].name;return lang==='en'?'Player':'玩家'}\nfunction renderOpening(r,g){var box=$('openingBox'),text=$('openingText'),acts=$('openingActions'),o=r.opening;acts.textContent='';if(!o||o.resolved){box.classList.add('hidden');text.textContent='';return}box.classList.remove('hidden');var me=r.myMemberId;if(o.phase==='banqi'){text.textContent=lang==='en'?'Player A flips first. The color revealed by that first piece becomes Player A’s color.':lang==='zh-Hans'?'玩家 A 先翻一子；第一颗翻出的棋是什么颜色，玩家 A 就执什么颜色。':'玩家 A 先翻一子；第一顆翻出的棋是什麼顏色，玩家 A 就執什麼顏色。';return}function add(label,obj){var b=document.createElement('button');b.className='btn secondary';b.type='button';b.textContent=label;b.addEventListener('click',function(){send(obj)});acts.appendChild(b)}if(o.phase==='guess'){text.textContent=(lang==='en'?openingPlayerName(r,o.holderId)+' holds hidden white stones; '+openingPlayerName(r,o.actorId)+' guesses odd/even.':openingPlayerName(r,o.holderId)+' 握住若干白子，'+openingPlayerName(r,o.actorId)+' 猜單雙。');if(me===o.actorId){add(lang==='en'?'Odd · 1 black stone':lang==='zh-Hans'?'单数 · 1 颗黑子':'單數 · 1 顆黑子',{type:'opening_guess',guess:'odd'});add(lang==='en'?'Even · 2 black stones':lang==='zh-Hans'?'双数 · 2 颗黑子':'雙數 · 2 顆黑子',{type:'opening_guess',guess:'even'})}return}if(o.phase==='hand'){text.textContent=lang==='en'?openingPlayerName(r,o.holderId)+' hides one color in each hand; '+openingPlayerName(r,o.actorId)+' chooses a hand.':openingPlayerName(r,o.holderId)+' 雙手藏白／黑棋，'+openingPlayerName(r,o.actorId)+' 選一隻手。';if(me===o.actorId){add(lang==='en'?'Left hand':'左手',{type:'opening_hand',hand:'left'});add(lang==='en'?'Right hand':'右手',{type:'opening_hand',hand:'right'})}return}if(o.phase==='choose'){text.textContent=o.mode==='manual'?(lang==='en'?'Players may decide freely; Player A selects their agreed color here.':lang==='zh-Hans'?'双方可自行决定；讨论后由玩家 A 在这里选择约定持色。':'雙方可自行決定；討論後由玩家 A 在這裡選擇約定持色。'):(lang==='en'?openingPlayerName(r,o.chooserId)+' won the guess and chooses a color.':openingPlayerName(r,o.chooserId)+' 取得選色權，請選擇持色。');if(me===o.chooserId){openingSides(r.gameId).forEach(function(s){add(sideName(r.gameId,s),{type:'opening_choose',side:s})})}}}\n`, 'opening client renderer');

replaceBlock('function renderStatus(r){', `function renderStatus(r){var g=r.gameState,o=r.opening,pending=o&&!o.resolved;if(pending&&o.phase!=='banqi')$('turnInfo').textContent=lang==='en'?'Opening color allocation':lang==='zh-Hans'?'猜先／分色中':'猜先／分色中';else if(pending&&o.phase==='banqi')$('turnInfo').textContent=lang==='en'?'Player A flips first':lang==='zh-Hans'?'玩家 A 先翻第一子':'玩家 A 先翻第一子';else $('turnInfo').textContent=r.status==='playing'?t('turn')+' '+sideName(r.gameId,g.turn):r.status==='waiting'?t('waiting'):t('finished');var role=r.rawRole==='player'?t('player')+(r.isHost?' · '+t('host'):'')+' · '+sideName(r.gameId,r.mySide):r.rawRole==='queued'?t('queued'):r.rawRole==='spectator'?t('spectator'):t('pending');$('roleInfo').textContent=role;renderOpening(r,g);$('lastMoveMarkerSetting').classList.toggle('hidden',!g||['go','gomoku','renju'].indexOf(g.type)<0);renderGoEstimate(r,g);$('passBtn').classList.toggle('hidden',pending||['go9','go13','go19'].indexOf(r.gameId)<0||r.status!=='playing'||r.rawRole!=='player');$('swapBtn').classList.toggle('hidden',pending||!r.canSwap||r.status!=='playing'||r.rawRole!=='player');$('resignBtn').disabled=pending||r.rawRole!=='player'||r.status!=='playing';$('rematchBtn').classList.toggle('hidden',r.status!=='finished'||r.rawRole!=='player'||r.queueSettings.queueEnabled);var b=$('resultBanner');if(!r.resultSummary){b.className='result-banner hidden'}else{var s=r.resultSummary;b.className='result-banner '+(s.outcome==='win'?'win':s.outcome==='loss'?'loss':'draw');$('resultTitle').textContent=s.outcome==='win'?t('win'):s.outcome==='loss'?t('loss'):s.outcome==='draw'?t('draw'):(s.winnerName?s.winnerName+' '+(lang==='en'?'wins':'勝'):t('roomEnded'));$('resultReason').textContent=(s.winnerName?(lang==='en'?'Winner: ':'勝者：')+s.winnerName+' · ':'')+s.reason}}`, 'renderStatus opening');

replaceBlock('function intrinsicBoardSize(g){', `function intrinsicBoardSize(g){if(g.type==='banqi')return{w:720,h:360};if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){var n=g.size||15;var s=n>=19?620:n>=15?540:n>=13?500:430;return{w:s,h:s}}return{w:720,h:720}}`, 'banqi intrinsic size');

replaceBlock('function renderGameBoard(g,el,interactive){', `function renderGameBoard(g,el,interactive){if(!g||!el)return;el.textContent='';if(g.type==='go'||g.type==='gomoku'||g.type==='renju')renderIntersectionBoard(g,el,interactive);else if(g.type==='xiangqi')renderXiangqi(g,el,interactive);else if(g.type==='banqi')renderBanqi(g,el,interactive);else renderSquareBoard(g,el,interactive)}`, 'banqi renderer dispatch');

insertBefore('function renderSquareBoard(g,el,interactive){', `function banqiBack(){var s=document.createElement('span');s.className='banqi-back';s.textContent='暗';return s}\nfunction renderBanqi(g,el,interactive){el.className='board banqi-board';el.style.width='100%';el.style.maxWidth='720px';for(var i=0;i<32;i++){var b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';b.className='sq'+(interactive&&selected===i?' selected':'')+(g.lastMove&&(g.lastMove.to===i||(g.lastMove.r===Math.floor(i/8)&&g.lastMove.c===i%8))?' last':'');var p=g.board[i];if(p==='?')b.appendChild(banqiBack());else if(p)b.appendChild(xqPiece(p));if(interactive)bindPoint(b,i,4,8);el.appendChild(b)}}\n`, 'banqi client renderer');

replaceBlock('function boardClick(index,rows,cols){', `function boardClick(index,rows,cols){var r=roomState,g=r&&r.gameState;if(!r||r.rawRole!=='player'||r.status!=='playing')return;var row=Math.floor(index/cols),col=index%cols;if(g.type==='banqi'){if(!g.assigned){if(r.mySeat!==g.turnSeat)return;if(g.board[index]==='?')send({type:'move',r:row,c:col});return}if(r.mySide!==g.turn)return;var bp=g.board[index],mine=r.mySide==='R'?'r':'b';if(bp==='?'&&selected==null){send({type:'move',r:row,c:col});return}if(selected==null){if(bp&&bp!=='?'&&bp[0]===mine){selected=index;renderBoard()}return}if(bp&&bp!=='?'&&bp[0]===mine){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null;return}if(r.mySide!==g.turn)return;if(g.type==='go'||g.type==='gomoku'||g.type==='renju'||g.type==='reversi'){send({type:'move',r:row,c:col});return}var p=g.board[index],mine2=g.type==='chess'?(r.mySide==='W'?'w':'b'):(r.mySide==='R'?'r':'b');if(selected==null){if(p&&p[0]===mine2){selected=index;renderBoard()}return}if(p&&p[0]===mine2){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null}`, 'banqi board clicks');

const required=[
  'const APP_VERSION = "0.0.24";', 'GAME_CATALOG.banqi', 'GAME_CATALOG.xiangqi_random', 'SIDE_MODE_CONFIG',
  'function newBanqi(', 'function applyBanqi(', 'function newXiangqiRandom(', 'covered:Array(32).fill(true)',
  'opening_guess', 'opening_choose', 'opening_hand', 'publicOpening(room)', 'visibleMemberSide',
  'startedAt: Number(this.room.startedAt)', 'roomTimingText(r)', 'id="openingBox"', 'renderBanqi(g,el,interactive)',
  '第一顆翻出的棋', 'Players may decide freely', '雙手藏棋', '猜單雙'
];
for (const marker of required) if (!source.includes(marker)) throw new Error(`v0.0.24 marker missing: ${marker}`);

await writeFile(worker, source, "utf8");
console.log(`SIM_V024_BYTES=${Buffer.byteLength(source)}`);
