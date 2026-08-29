import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const worker = new URL("./worker.js", import.meta.url);
let source = await readFile(worker, "utf8");
const sourceHash = createHash("sha256").update(source).digest("hex");
const expectedSourceHash = "8f168113e24472377fec462bf61812e0b765a3707f72f7f6b249a6997e4a23e5";
if (sourceHash !== expectedSourceHash) throw new Error(`v0.0.24 source hash mismatch: ${sourceHash}`);

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

insertBefore('function newXiangqi(', `function newBanqi(rules = {}) {\n  const pieces = [];\n  for (const color of ["r","b"]) {\n    pieces.push(color+"K");\n    pieces.push(color+"A", color+"A", color+"E", color+"E", color+"R", color+"R", color+"H", color+"H", color+"C", color+"C");\n    for (let i = 0; i < 5; i++) pieces.push(color+"P");\n  }\n  return {\n    type:"banqi", rows:4, cols:8, board:secureShuffle(pieces), covered:Array(32).fill(true),\n    assigned:false, turnSeat:0, turn:null, moveNumber:0, ended:false, result:null, lastMove:null, rules:structuredClone(rules || {}),\n  };\n}\nfunction banqiColor(piece) { return piece?.[0] === "r" ? "R" : "B"; }\nfunction banqiRank(piece) { return ({K:7,A:6,E:5,R:4,H:3,C:2,P:1})[piece?.[1]] || 0; }\nfunction banqiCanRankCapture(a, d) {\n  if (!a || !d) return false;\n  if (a[1] === "K" && d[1] === "P") return false;\n  if (a[1] === "P" && d[1] === "K") return true;\n  return banqiRank(a) >= banqiRank(d);\n}\nfunction banqiRC(i) { return [Math.floor(i / 8), i % 8]; }\nfunction banqiAdjacent(a, b) { const [ar,ac]=banqiRC(a), [br,bc]=banqiRC(b); return Math.abs(ar-br)+Math.abs(ac-bc)===1; }\nfunction banqiScreens(game, from, to) {\n  const [fr,fc]=banqiRC(from), [tr,tc]=banqiRC(to);\n  if (fr !== tr && fc !== tc) return -1;\n  let count=0;\n  if (fr===tr) for(let c=Math.min(fc,tc)+1;c<Math.max(fc,tc);c++) if(game.board[fr*8+c]) count++;\n  else for(let r=Math.min(fr,tr)+1;r<Math.max(fr,tr);r++) if(game.board[r*8+fc]) count++;\n  return count;\n}\nfunction banqiLegalFromTo(game, side, from, to) {\n  if (!Number.isInteger(from) || !Number.isInteger(to) || from<0 || from>=32 || to<0 || to>=32 || from===to) return false;\n  const piece=game.board[from];\n  if (!piece || game.covered[from] || banqiColor(piece)!==side) return false;\n  const target=game.board[to];\n  if (!target) return banqiAdjacent(from,to);\n  if (piece[1]==="C") {\n    if (banqiScreens(game,from,to)!==1) return false;\n    return game.covered[to] || banqiColor(target)!==side;\n  }\n  if (game.covered[to] || banqiColor(target)===side || !banqiAdjacent(from,to)) return false;\n  return banqiCanRankCapture(piece,target);\n}\nfunction banqiHasLegal(game, side) {\n  if (game.covered.some((v,i)=>v && game.board[i])) return true;\n  for (let from=0; from<32; from++) {\n    const p=game.board[from];\n    if (!p || game.covered[from] || banqiColor(p)!==side) continue;\n    for (let to=0; to<32; to++) if (banqiLegalFromTo(game,side,from,to)) return true;\n  }\n  return false;\n}\nfunction applyBanqi(game, side, msg) {\n  const g=structuredClone(game);\n  if (g.ended) return {ok:false,error:"棋局已結束"};\n  const seat=Number(msg?.seat);\n  if (![0,1].includes(seat)) return {ok:false,error:"缺少玩家席位"};\n  const r=Number(msg?.r), c=Number(msg?.c);\n  if (Number.isInteger(r) && Number.isInteger(c)) {\n    const idx=r*8+c;\n    if (r<0||r>=4||c<0||c>=8||!g.board[idx]||!g.covered[idx]) return {ok:false,error:"此處不能翻子"};\n    if (!g.assigned && seat!==g.turnSeat) return {ok:false,error:"還沒輪到你翻第一子"};\n    if (g.assigned && side!==g.turn) return {ok:false,error:"還沒輪到你"};\n    g.covered[idx]=false;\n    g.moveNumber=(g.moveNumber||0)+1;\n    g.lastMove={r,c,flip:true};\n    let assignedSide=null;\n    if (!g.assigned) {\n      assignedSide=banqiColor(g.board[idx]);\n      g.assigned=true;\n      g.turn=openingOtherSide("banqi",assignedSide);\n    } else g.turn=openingOtherSide("banqi",side);\n    return {ok:true,game:g,assignedSide};\n  }\n  const from=Number(msg?.from), to=Number(msg?.to);\n  if (!g.assigned || side!==g.turn) return {ok:false,error:"還沒輪到你"};\n  if (!banqiLegalFromTo(g,side,from,to)) return {ok:false,error:"暗棋走法不合法"};\n  const target=g.board[to];\n  g.board[to]=g.board[from]; g.covered[to]=false;\n  g.board[from]=null; g.covered[from]=false;\n  g.moveNumber=(g.moveNumber||0)+1; g.lastMove={from,to};\n  const other=openingOtherSide("banqi",side);\n  const remaining=g.board.some((p)=>p&&banqiColor(p)===other);\n  if (!remaining || !banqiHasLegal(g,other)) {\n    g.ended=true; g.result={winner:side,reason:remaining?"對手無合法步":"吃光對方棋子"};\n  } else g.turn=other;\n  return {ok:true,game:g};\n}\n\nfunction newXiangqiRandom(rules = {}) {\n  const g=newXiangqi(rules);\n  const shuffleRank=(row,color)=>{\n    const pieces=[color+"R",color+"H",color+"E",color+"A",color+"K",color+"A",color+"E",color+"H",color+"R"];\n    const king=pieces.splice(4,1)[0];\n    const advisors=pieces.filter((p)=>p[1]==="A");\n    const rest=pieces.filter((p)=>p[1]!=="A");\n    const slots=[0,1,2,3,4,5,6,7,8];\n    const palace=[3,4,5];\n    const kslot=palace[secureRandomInt(palace.length)];\n    g.board[row*9+kslot]=king;\n    const left=slots.filter((x)=>x!==kslot);\n    const advisorSlots=secureShuffle(left.filter((x)=>palace.includes(x))).slice(0,2);\n    const remainingSlots=left.filter((x)=>!advisorSlots.includes(x));\n    for(let i=0;i<2;i++) g.board[row*9+advisorSlots[i]]=advisors[i];\n    const shuffled=secureShuffle(rest);\n    remainingSlots.forEach((slot,i)=>{g.board[row*9+slot]=shuffled[i]});\n  };\n  for(let c=0;c<9;c++){g.board[c]=null;g.board[9*9+c]=null;}\n  shuffleRank(0,"b"); shuffleRank(9,"r");\n  g.type="xiangqi"; g.variant="random";\n  return g;\n}\n\n`, 'banqi and random xiangqi games');

mutateBlock('function newGame(gameId, rules) {', (block) => block
  .replace('  if (gameId === "xiangqi") return newXiangqi(rules);', '  if (gameId === "banqi") return newBanqi(rules);\n  if (gameId === "xiangqi_random") return newXiangqiRandom(rules);\n  if (gameId === "xiangqi") return newXiangqi(rules);')
, 'newGame variants');

mutateBlock('function publicGameState(game) {', (block) => block.replace(
  '  const out = structuredClone(game);',
  '  const out = structuredClone(game);\n  if (out?.type === "banqi" && Array.isArray(out.covered)) {\n    out.board = out.board.map((p,i) => out.covered[i] && p ? "?" : p);\n  }'
), 'banqi public masking');

replaceCount('gameId === "xiangqi"', '(gameId === "xiangqi" || gameId === "xiangqi_random")', 3, 'xiangqi family branches');
replaceCount('g.type === "xiangqi"', '(g.type === "xiangqi" || g.type === "xiangqi_random")', 2, 'client xiangqi branches');

replaceExact('      createdAt: now,\n      updatedAt: now,\n      ownerId: owner.id,', '      createdAt: now,\n      updatedAt: now,\n      startedAt: null,\n      endedAt: null,\n      opening: null,\n      ownerId: owner.id,', 'room time initialization');

replaceBlock('  maybeStartMatch() {', `  maybeStartMatch() {\n    const room = this.room;\n    if (!room || !room.seats[0] || !room.seats[1]) { if (room && room.status !== "finished") room.status = "waiting"; return false; }\n    room.matchSeq = (Number(room.matchSeq) || 0) + 1;\n    room.status = "playing"; room.result = null; room.rematchVotes = []; room.startedAt = Date.now(); room.endedAt = null;\n    for (const id of room.seats) this.clearOfflineForfeit(roomMemberById(room,id));\n    const first=seatMember(room,0), second=seatMember(room,1);\n    if (room.gameId === "banqi") {\n      first.side=null; second.side=null; room.game=newBanqi(room.rules); room.opening={mode:"first_flip",phase:"flip",resolved:false,actorId:first.id}; this.startReplay(); return true;\n    }\n    room.game = newGame(room.gameId, room.rules);\n    const mode=room.rules?.sideMode || SIDE_MODE_CONFIG[gameFamily(room.gameId)]?.default || "random";\n    first.side=null; second.side=null;\n    if (mode === "random") {\n      if (secureRandomInt(2)) assignOpeningSides(room,second.id,openingFirstSide(room.gameId));\n      else assignOpeningSides(room,first.id,openingFirstSide(room.gameId));\n      this.startReplay();\n    } else if (mode === "manual") {\n      room.opening={mode,phase:"choose",resolved:false,chooserId:first.id};\n    } else if (mode === "hidden" && room.gameId === "chess") {\n      const hands=secureShuffle(["W","B"]);\n      room.opening={mode,phase:"hand",resolved:false,holderId:first.id,actorId:second.id,leftSide:hands[0],rightSide:hands[1]};\n    } else {\n      const holder=secureRandomInt(2)?first:second, actor=holder.id===first.id?second:first;\n      room.opening={mode:"guess",phase:"guess",resolved:false,holderId:holder.id,actorId:actor.id,secretParity:secureRandomInt(2)?"odd":"even",guessRule:(room.gameId==="xiangqi"||room.gameId==="xiangqi_random")?"choose_color":"direct_first"};\n    }\n    return true;\n  }`, 'match opening flow');

mutateBlock('  startReplay() {', (block) => block.replace('initialGame:publicGameState(room.game)', 'initialGame:structuredClone(room.game)')
, 'startReplay hidden-state source');

mutateBlock('  archiveReplay(result) {', (block) => block.replace('room.currentReplay.result = result;', 'room.currentReplay.result = result;\n    room.currentReplay.initialGame = publicGameState(room.currentReplay.initialGame);')
, 'archive replay masking');

mutateBlock('  async webSocketMessage(ws, message) {', (block) => block.replace(
  '      if (msg.type === "move") await this.handleMove(token, msg);',
  '      if (msg.type === "opening_guess") await this.handleOpeningGuess(token, msg);\n      else if (msg.type === "opening_choose") await this.handleOpeningChoose(token, msg);\n      else if (msg.type === "opening_hand") await this.handleOpeningHand(token, msg);\n      else if (msg.type === "move") await this.handleMove(token, msg);'
), 'opening websocket commands');

insertBefore('  async handleMove(token, msg) {', `  async handleOpeningGuess(token, msg) {\n    const room=this.room, auth=this.authToken(token);\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\n    const o=room.opening;\n    if (!o || o.resolved || o.phase!=="guess" || auth.member.id!==o.actorId) throw new Error("目前不能猜單雙");\n    const guess=msg?.guess==="odd"?"odd":msg?.guess==="even"?"even":null;\n    if (!guess) throw new Error("請選擇單數或雙數");\n    const correct=guess===o.secretParity;\n    delete o.secretParity;\n    if (o.guessRule==="direct_first") {\n      const firstId=correct?o.actorId:o.holderId;\n      assignOpeningSides(room,firstId,openingFirstSide(room.gameId));\n      room.startedAt=room.startedAt||Date.now();\n      this.startReplay();\n    } else { o.phase="choose"; o.chooserId=correct?o.actorId:o.holderId; }\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\n  }\n\n  async handleOpeningChoose(token, msg) {\n    const room=this.room, auth=this.authToken(token);\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\n    const o=room.opening;\n    if (!o || o.resolved || o.phase!=="choose" || auth.member.id!==o.chooserId) throw new Error("目前不能選擇持色");\n    const first=openingFirstSide(room.gameId), other=openingOtherSide(room.gameId,first), side=String(msg?.side||"");\n    if (side!==first && side!==other) throw new Error("持色無效");\n    assignOpeningSides(room,auth.member.id,side);\n    room.startedAt=room.startedAt||Date.now();\n    this.startReplay();\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\n  }\n\n  async handleOpeningHand(token, msg) {\n    const room=this.room, auth=this.authToken(token);\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\n    const o=room.opening;\n    if (!o || o.resolved || o.phase!=="hand" || auth.member.id!==o.actorId) throw new Error("目前不能選手");\n    const hand=msg?.hand==="left"?"left":msg?.hand==="right"?"right":null;\n    if (!hand) throw new Error("請選左手或右手");\n    const side=hand==="left"?o.leftSide:o.rightSide;\n    delete o.leftSide; delete o.rightSide;\n    assignOpeningSides(room,auth.member.id,side);\n    room.startedAt=room.startedAt||Date.now();\n    this.startReplay();\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\n  }\n\n`, 'opening handlers');

replaceBlock('  async handleMove(token, msg) {', `  async handleMove(token, msg) {\n    const room = this.room;\n    const auth = this.authToken(token);\n    if (!room || room.status !== "playing") throw new Error("棋局尚未開始或已結束。");\n    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\n    if (room.opening && !room.opening.resolved && room.gameId !== "banqi") throw new Error("猜先／分色尚未完成");\n    if (room.gameId === "banqi") {\n      const seat=room.seats.indexOf(auth.member.id);\n      if (!room.game.assigned) { if (room.game.turnSeat!==seat) throw new Error("還沒輪到你翻第一子"); }\n      else if (room.game.turn!==auth.member.side) throw new Error("還沒輪到你");\n      const action={...msg,seat};\n      const next=applyBanqi(room.game,auth.member.side,action);\n      if (!next.ok) throw new Error(next.error || "暗棋走法不合法");\n      room.game=next.game; room.rematchVotes=[];\n      this.recordReplayAction(auth.member,action,"move");\n      if (next.assignedSide && room.opening && !room.opening.resolved) {\n        assignOpeningSides(room,auth.member.id,next.assignedSide);\n        room.startedAt=room.startedAt||Date.now();\n        if (room.currentReplay) room.currentReplay.players=room.seats.map((id)=>roomMemberById(room,id)).filter(Boolean).map((m)=>({memberId:m.id,name:m.name,side:m.side}));\n      }\n      if (next.game.ended) await this.finishMatch(next.game.result);\n      else { await this.saveRoom(); await this.syncLobby(); await this.broadcastState(); }\n      return;\n    }\n    const result = applyGameAction(room.game, auth.member.side, msg);\n    this.recordReplayAction(auth.member, msg, "move");\n    room.game = result.game; room.rematchVotes = [];\n    if (result.ended) await this.finishMatch(result.result);\n    else { await this.saveRoom(); await this.syncLobby(); await this.broadcastState(); }\n  }`, 'handleMove opening and banqi');

mutateBlock('  async resign(token) {', (block) => block.replace(
  '    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");',
  '    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");\n    if (room.opening && !room.opening.resolved) throw new Error("猜先／分色尚未完成");'
), 'resign opening guard');

mutateBlock('  async finishMatch(result) {', (block) => block.replace(
  '    room.status = "finished";',
  '    room.status = "finished";\n    room.endedAt = Date.now();'
), 'finish match end time');

mutateBlock('  lobbyRecord() {', (block) => {
  const needle='      queueLength: r.queue.length, createdAt: r.createdAt, updatedAt: r.updatedAt,';
  if (!block.includes(needle)) throw new Error('lobbyRecord timing row missing');
  return block.replace(needle, '      queueLength: r.queue.length, createdAt: r.createdAt, startedAt: Number(r.startedAt) || null, endedAt: Number(r.endedAt) || null, updatedAt: r.updatedAt,');
}, 'lobby record timing');

replaceBlock('function roomView(room, token) {', `function roomView(room, token) {\n  if (!room) return null;\n  const member = roomMemberByToken(room, token);\n  const role = member ? (member.role === "player" ? (member.isOwner ? "host" : "guest") : member.role) : "unknown";\n  const playerA = seatMember(room, 0), playerB = seatMember(room, 1);\n  const isOwner = !!member && member.id === room.ownerId;\n  const chat = member?.role === "player" ? room.playerChat : (["spectator", "queued"].includes(member?.role) ? room.spectatorChat : []);\n  const openingPending = !!room.opening && !room.opening.resolved;\n  return {\n    id: room.id, name: room.name, gameId: room.gameId, game: GAME_CATALOG[room.gameId],\n    rules: structuredClone(room.rules || normalizeRules(room.gameId, {})), rulesSummary: rulesSummary(room.gameId, room.rules || normalizeRules(room.gameId, {})),\n    ruleDefs: publicRuleDefs(room.gameId), privateRoom: room.privateRoom, status: room.status, role, rawRole: member?.role || "unknown",\n    createdAt:Number(room.createdAt)||null, startedAt:Number(room.startedAt)||null, endedAt:Number(room.endedAt)||null,\n    isHost: isOwner, myMemberId: member?.id || null, mySide: visibleMemberSide(room, member), mySeat: member ? room.seats.indexOf(member.id) : -1,\n    players: { host: publicMemberForRoom(room, playerA), guest: publicMemberForRoom(room, playerB) },\n    pending: isOwner ? room.pending.map((id) => publicMember(roomMemberById(room, id))).filter(Boolean) : [],\n    queue: room.queue.map((id, index) => ({ ...publicMember(roomMemberById(room, id)), position: index + 1 })).filter((x) => x.id),\n    spectatorCount: room.members.filter((m) => m.role === "spectator").length,\n    queueSettings: { ...room.settings },\n    gameState: publicGameState(room.game), result: room.result, resultSummary: resultSummary(room, token),\n    chat: Array.isArray(chat) ? chat.slice(-MAX_CHAT_HISTORY).map((m) => ({ id: m.id, memberId: m.memberId, name: m.name, role: m.role, side: openingPending ? null : m.side, text: m.text, at: m.at })) : [],\n    chatChannel: member?.role === "player" ? "players" : (["spectator", "queued"].includes(member?.role) ? "spectators" : "none"),\n    rematchVotes: member?.role === "player" ? room.rematchVotes.length : 0,\n    canSwap: member?.role === "player" && room.seats[1] === member.id && room.gameId === "gomoku" && !!room.game?.swapAvailable,\n    opening: publicOpening(room),\n    replays: member && member.role !== "pending" ? room.replays.slice(-MAX_REPLAY_HISTORY).reverse().map(replaySummary) : [],\n  };\n}`, 'room view opening and timing');

mutateBlock('function sanitizeLobbyRecord(r) {', (block) => block.replace(
  '    createdAt: Number(r.createdAt) || Date.now(), updatedAt: Number(r.updatedAt) || Date.now(),',
  '    createdAt: Number(r.createdAt) || Date.now(), startedAt: Number(r.startedAt) || null, endedAt: Number(r.endedAt) || null, updatedAt: Number(r.updatedAt) || Date.now(),'
), 'sanitize lobby timing');

insertBefore('function html() {', `function durationParts(ms){var total=Math.max(0,Math.floor((Number(ms)||0)/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;return{h:h,m:m,s:s}}\nfunction durationText(ms){var p=durationParts(ms),a=[];if(p.h)a.push(p.h+(lang==='en'?'h':'小時'));if(p.m||p.h)a.push(p.m+(lang==='en'?'m':'分'));a.push(p.s+(lang==='en'?'s':'秒'));return a.join(lang==='en'?' ':' ')}\n\n`, 'duration helpers');

replaceExact('<div id="resultBox" class="result-box hidden"></div>', '<div id="openingBox" class="result-box hidden"></div>\n          <div id="resultBox" class="result-box hidden"></div>', 'opening UI box');

replaceExact('.result-box{margin:12px 0;padding:12px;border-radius:12px;background:#111d29;border:1px solid #2a3b50;color:#dbe7f3}', '.result-box{margin:12px 0;padding:12px;border-radius:12px;background:#111d29;border:1px solid #2a3b50;color:#dbe7f3}\n.opening-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.banqi-board{display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:2/1;border:3px solid #6f4a2c;background:linear-gradient(145deg,#e7c78d,#b77b43)}.banqi-board .sq{aspect-ratio:1/1;border:1px solid rgba(70,40,20,.35);display:flex;align-items:center;justify-content:center;background:rgba(255,246,218,.3)}.banqi-back{width:72%;height:72%;border-radius:50%;display:grid;place-items:center;background:#7d1f1f;color:#f8e7bd;border:3px double #e3c78d;font-weight:900;box-shadow:0 2px 5px #0006}', 'opening and banqi styles');

insertBefore('function renderStatus(r){', `function openingSideLabel(gameId,side){if(gameId==='chess')return side==='W'?(lang==='en'?'White':'白方'):(lang==='en'?'Black':'黑方');if(gameId==='xiangqi'||gameId==='xiangqi_random'||gameId==='banqi')return side==='R'?(lang==='en'?'Red':'紅方'):(lang==='en'?'Black':'黑方');return side==='B'?(lang==='en'?'Black':'黑方'):(lang==='en'?'White':'白方')}\nfunction renderOpening(r){var el=$('openingBox'),o=r&&r.opening;if(!el)return;if(!o||o.resolved||r.status!=='playing'){el.classList.add('hidden');el.innerHTML='';return}el.classList.remove('hidden');var mine=r.myMemberId,html='';if(o.mode==='first_flip'){html=lang==='en'?'Player A flips first; the first revealed piece determines colors.':'玩家 A 先翻第一子；第一顆翻出的棋決定雙方紅黑。'}else if(o.phase==='guess'){if(mine===o.actorId)html=(lang==='en'?'Guess odd or even.':'請猜單數或雙數。')+'<div class="opening-actions"><button class="btn" onclick="send({type:\'opening_guess\',guess:\'odd\'})">'+(lang==='en'?'Odd':'單數')+'</button><button class="btn" onclick="send({type:\'opening_guess\',guess:\'even\'})">'+(lang==='en'?'Even':'雙數')+'</button></div>';else html=(lang==='en'?(o.actorName||'Opponent')+' is guessing odd/even.':(o.actorName||'對手')+' 正在猜單雙。')}else if(o.phase==='choose'){if(mine===o.chooserId){var a=openingFirstSide(r.gameId),b=(r.gameId==='chess'?(a==='W'?'B':'W'):(r.gameId==='xiangqi'||r.gameId==='xiangqi_random'||r.gameId==='banqi'?(a==='R'?'B':'R'):(a==='B'?'W':'B')));html=(lang==='en'?'Choose your color.':'請選擇持色。')+'<div class="opening-actions"><button class="btn" onclick="send({type:\'opening_choose\',side:\''+a+'\'})">'+openingSideLabel(r.gameId,a)+'</button><button class="btn" onclick="send({type:\'opening_choose\',side:\''+b+'\'})">'+openingSideLabel(r.gameId,b)+'</button></div>'}else html=(lang==='en'?(o.chooserName||'Opponent')+' is choosing a color.':(o.chooserName||'對手')+' 正在選擇持色。')}else if(o.phase==='hand'){if(mine===o.actorId)html=(lang==='en'?'Choose left or right hand.':'請選左手或右手。')+'<div class="opening-actions"><button class="btn" onclick="send({type:\'opening_hand\',hand:\'left\'})">'+(lang==='en'?'Left hand':'左手')+'</button><button class="btn" onclick="send({type:\'opening_hand\',hand:\'right\'})">'+(lang==='en'?'Right hand':'右手')+'</button></div>';else html=lang==='en'?(o.actorName||'Opponent')+' is choosing a hand.':(o.actorName||'對手')+' 正在選手。'}el.innerHTML=html}\nfunction roomTimingText(r){if(!r)return'';if(r.status==='playing'&&r.startedAt)return(lang==='en'?'Elapsed: ':'已進行：')+durationText(Date.now()-r.startedAt);if(r.status==='finished'&&r.startedAt&&r.endedAt)return(lang==='en'?'Duration: ':'對局時間：')+durationText(r.endedAt-r.startedAt);return''}\n\n`, 'opening client UI');

mutateBlock('function renderStatus(r){', (block) => block.replace(
  '  renderBoard();',
  `  renderOpening(r);\n  var timing=roomTimingText(r);\n  if(timing){var span=document.createElement('span');span.className='badge';span.textContent=timing;$('roomStatus').appendChild(span)}\n  renderBoard();`
), 'status opening UI');

mutateBlock('function localizedRulesSummary(r){', (block) => block.replace(
  `if(r.gameId==='go')`,
  `if(r.gameId==='banqi')return lang==='en'?'32 hidden pieces · first flip assigns colors':'32 子蓋牌 · 第一顆翻出的棋決定持色';if(r.gameId==='xiangqi_random')return lang==='en'?'Xiangqi · randomized legal back ranks':'象棋 · 合法底線隨機布局';if(r.gameId==='go')`
), 'localized variant summaries');

mutateBlock('function localizeRuleFieldLabel(key,base){', (block) => block.replace(
  `var map={`,
  `var map={sideMode:'Side allocation',`
), 'english side mode label');

replaceExact(`if(gameId==='chess')return 'Chess: White is Seat A, Black is Seat B. Colors are fixed when the match begins.';`, `if(gameId==='chess')return 'Chess: colors follow the selected side-allocation method. In Hidden Hands, one player conceals one White and one Black marker while the other chooses left or right.';`, 'english chess help');
replaceExact(`if(gameId==='go')return 'Go: Black moves first; komi compensates White. Area/Territory scoring follows the selected rule. Capture Go ends when the capture goal is reached.';`, `if(gameId==='go')return 'Go: the selected side-allocation method decides Black/White. Black moves first; komi compensates White. Area/Territory scoring follows the selected rule. Capture Go ends when the capture goal is reached.';`, 'english go help');
replaceExact(`if(gameId==='gomoku')return 'Gomoku: Black moves first. Freestyle allows overlines; Exact Five requires exactly five. Swap lets Seat B exchange colors after the opening move.';`, `if(gameId==='gomoku')return 'Gomoku: the selected side-allocation method decides Black/White, then Black moves first. Freestyle allows overlines; Exact Five requires exactly five. Swap lets Seat B exchange colors after the opening move.';`, 'english gomoku help');
replaceExact(`if(gameId==='renju')return 'Renju: Black moves first under forbidden-move rules; White has no forbidden patterns. Choose standard Renju or custom forbidden-move combinations.';`, `if(gameId==='renju')return 'Renju: the selected side-allocation method decides Black/White; Black moves first under forbidden-move rules while White has no forbidden patterns.';`, 'english renju help');
replaceExact(`if(gameId==='xiangqi')return 'Xiangqi: Red moves first. Standard palace, river and flying-general rules apply.';`, `if(gameId==='xiangqi'||gameId==='xiangqi_random')return 'Xiangqi: the selected side-allocation method decides Red/Black; Red moves first. Standard palace, river and flying-general rules apply.';`, 'english xiangqi help');

mutateBlock('function renderRuleForm(){', (block) => block.replace(
  `var defs=gameRuleDefs[gameId]||{defaults:{},fields:[],extraHelp:''};`,
  `var defs=gameRuleDefs[gameId]||{defaults:{},fields:[],extraHelp:''};if(gameId==='banqi'){hostRules={};$('ruleFields').innerHTML='<p class="muted">'+(lang==='en'?'32 pieces are shuffled face-down. Player A flips first; the first revealed piece determines both players’ colors.':'32 子隨機洗牌後全部蓋牌；玩家 A 先翻第一子，第一顆翻出的棋決定雙方紅黑。')+'</p>';return}`
), 'banqi rule form');

replaceBlock('function intrinsicBoardSize(g){', `function intrinsicBoardSize(g){if(g.type==='banqi')return{w:720,h:360};if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){var n=g.size||15;var s=n>=19?620:n>=15?540:n>=13?500:430;return{w:s,h:s}}return{w:720,h:720}}`, 'banqi intrinsic size');

replaceBlock('function renderGameBoard(g,el,interactive){', `function renderGameBoard(g,el,interactive){if(!g||!el)return;el.textContent='';if(g.type==='go'||g.type==='gomoku'||g.type==='renju')renderIntersectionBoard(g,el,interactive);else if(g.type==='xiangqi')renderXiangqi(g,el,interactive);else if(g.type==='banqi')renderBanqi(g,el,interactive);else renderSquareBoard(g,el,interactive)}`, 'banqi renderer dispatch');

insertBefore('function renderSquareBoard(g,el,interactive){', `function banqiBack(){var s=document.createElement('span');s.className='banqi-back';s.textContent='暗';return s}\nfunction renderBanqi(g,el,interactive){el.className='board banqi-board';el.style.width='100%';el.style.maxWidth='720px';for(var i=0;i<32;i++){var b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';b.className='sq'+(interactive&&selected===i?' selected':'')+(g.lastMove&&(g.lastMove.to===i||(g.lastMove.r===Math.floor(i/8)&&g.lastMove.c===i%8))?' last':'');var p=g.board[i];if(p==='?')b.appendChild(banqiBack());else if(p)b.appendChild(xqPiece(p));if(interactive)bindPoint(b,i,4,8);el.appendChild(b)}}\n`, 'banqi client renderer');

replaceBlock('function boardClick(index,rows,cols){', `function boardClick(index,rows,cols){var r=roomState,g=r&&r.gameState;if(!r||r.rawRole!=='player'||r.status!=='playing')return;var row=Math.floor(index/cols),col=index%cols;if(g.type==='banqi'){if(!g.assigned){if(r.mySeat!==g.turnSeat)return;if(g.board[index]==='?')send({type:'move',r:row,c:col});return}if(r.mySide!==g.turn)return;var bp=g.board[index],mine=r.mySide==='R'?'r':'b';if(bp==='?'&&selected==null){send({type:'move',r:row,c:col});return}if(selected==null){if(bp&&bp!=='?'&&bp[0]===mine){selected=index;renderBoard()}return}if(bp&&bp!=='?'&&bp[0]===mine){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null;return}if(r.mySide!==g.turn)return;if(g.type==='go'||g.type==='gomoku'||g.type==='renju'||g.type==='reversi'){send({type:'move',r:row,c:col});return}var p=g.board[index],mine2=g.type==='chess'?(r.mySide==='W'?'w':'b'):(r.mySide==='R'?'r':'b');if(selected==null){if(p&&p[0]===mine2){selected=index;renderBoard()}return}if(p&&p[0]===mine2){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null}`, 'banqi board clicks');

const required=[
  'const APP_VERSION = "0.0.24";', 'GAME_CATALOG.banqi', 'GAME_CATALOG.xiangqi_random', 'SIDE_MODE_CONFIG',
  'function newBanqi(', 'function applyBanqi(', 'function newXiangqiRandom(', 'covered:Array(32).fill(true)',
  'opening_guess', 'opening_choose', 'opening_hand', 'publicOpening(room)', 'visibleMemberSide',
  'startedAt:Number(room.startedAt)', 'roomTimingText(r)', 'id="openingBox"', 'renderBanqi(g,el,interactive)',
  '第一顆翻出的棋', 'Players may decide freely', '雙手藏棋', '猜單雙'
];
for (const marker of required) if (!source.includes(marker)) throw new Error(`v0.0.24 marker missing: ${marker}`);

const outputHash = createHash("sha256").update(source).digest("hex");
const expectedOutputHash = "bf661f6d7f09c21742d0d75fd2cda4825d270136ef5a64d70399c69769ee2ed7";
if (outputHash !== expectedOutputHash) throw new Error(`v0.0.24 output hash mismatch: ${outputHash}`);
await writeFile(worker, source, "utf8");
console.log(`Patched BoardVerse v0.0.24 worker.js (${Buffer.byteLength(source)} bytes, SHA-256 ${outputHash})`);
