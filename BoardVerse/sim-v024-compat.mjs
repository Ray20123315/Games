import { readFile, writeFile } from "node:fs/promises";
const file = new URL("./sim-v024.mjs", import.meta.url);
let s = await readFile(file, "utf8");

function replacePatch(startMarker, endMarker, replacement, label) {
  const a=s.indexOf(startMarker);
  if(a<0) throw new Error(label+' start marker missing');
  const e=s.indexOf(endMarker,a);
  if(e<0) throw new Error(label+' end marker missing');
  const b=e+endMarker.length;
  s=s.slice(0,a)+replacement+s.slice(b);
}

const old = "replaceExact('      createdAt: now,\\n      updatedAt: now,\\n      ownerId: owner.id,', '      createdAt: now,\\n      updatedAt: now,\\n      startedAt: null,\\n      endedAt: null,\\n      opening: null,\\n      ownerId: owner.id,', 'room time initialization');";
const next = "replaceExact('      ownerId: owner.id,', '      startedAt: null,\\n      endedAt: null,\\n      opening: null,\\n      ownerId: owner.id,', 'room time initialization');";
if (!s.includes(old)) throw new Error('compat room source marker missing');
s = s.replace(old, next);

replacePatch(
  "mutateBlock('  lobbyRecord() {'",
  "}, 'lobby record timing');",
  `mutateBlock('  lobbyRecord() {', (block) => {\n  const needle='      queueLength: r.queue.length, createdAt: r.createdAt, updatedAt: r.updatedAt,';\n  if (!block.includes(needle)) throw new Error('lobbyRecord timing row missing');\n  return block.replace(needle, '      queueLength: r.queue.length, createdAt: r.createdAt, startedAt: Number(r.startedAt) || null, endedAt: Number(r.endedAt) || null, updatedAt: r.updatedAt,');\n}, 'lobby record timing');`,
  'lobby patch'
);

replacePatch(
  "mutateBlock('  roomView(token) {'",
  "}, 'room view opening and timing');",
  `replaceBlock('function roomView(room, token) {', \`function roomView(room, token) {\n  if (!room) return null;\n  const member = roomMemberByToken(room, token);\n  const role = member ? (member.role === "player" ? (member.isOwner ? "host" : "guest") : member.role) : "unknown";\n  const playerA = seatMember(room, 0), playerB = seatMember(room, 1);\n  const isOwner = !!member && member.id === room.ownerId;\n  const chat = member?.role === "player" ? room.playerChat : (["spectator", "queued"].includes(member?.role) ? room.spectatorChat : []);\n  const openingPending = !!room.opening && !room.opening.resolved;\n  return {\n    id: room.id, name: room.name, gameId: room.gameId, game: GAME_CATALOG[room.gameId],\n    rules: structuredClone(room.rules || normalizeRules(room.gameId, {})), rulesSummary: rulesSummary(room.gameId, room.rules || normalizeRules(room.gameId, {})),\n    ruleDefs: publicRuleDefs(room.gameId), privateRoom: room.privateRoom, status: room.status, role, rawRole: member?.role || "unknown",\n    createdAt:Number(room.createdAt)||null, startedAt:Number(room.startedAt)||null, endedAt:Number(room.endedAt)||null,\n    isHost: isOwner, myMemberId: member?.id || null, mySide: visibleMemberSide(room, member), mySeat: member ? room.seats.indexOf(member.id) : -1,\n    players: { host: publicMemberForRoom(room, playerA), guest: publicMemberForRoom(room, playerB) },\n    pending: isOwner ? room.pending.map((id) => publicMember(roomMemberById(room, id))).filter(Boolean) : [],\n    queue: room.queue.map((id, index) => ({ ...publicMember(roomMemberById(room, id)), position: index + 1 })).filter((x) => x.id),\n    spectatorCount: room.members.filter((m) => m.role === "spectator").length,\n    queueSettings: { ...room.settings },\n    gameState: publicGameState(room.game), result: room.result, resultSummary: resultSummary(room, token),\n    chat: Array.isArray(chat) ? chat.slice(-MAX_CHAT_HISTORY).map((m) => ({ id: m.id, memberId: m.memberId, name: m.name, role: m.role, side: openingPending ? null : m.side, text: m.text, at: m.at })) : [],\n    chatChannel: member?.role === "player" ? "players" : (["spectator", "queued"].includes(member?.role) ? "spectators" : "none"),\n    rematchVotes: member?.role === "player" ? room.rematchVotes.length : 0,\n    canSwap: member?.role === "player" && room.seats[1] === member.id && room.gameId === "gomoku" && !!room.game?.swapAvailable,\n    opening: publicOpening(room),\n    replays: member && member.role !== "pending" ? room.replays.slice(-MAX_REPLAY_HISTORY).reverse().map(replaySummary) : [],\n  };\n}\`, 'room view opening and timing');`,
  'room view patch'
);

const replayStrict = "replaceCount('initialGame:publicGameState(room.game)', 'initialGame:structuredClone(room.game)', 1, 'startReplay hidden-state source');";
const replayFlexible = "if (source.includes('initialGame:publicGameState(room.game)')) source = source.split('initialGame:publicGameState(room.game)').join('initialGame:structuredClone(room.game)');";
if(!s.includes(replayStrict)) throw new Error('compat replay source marker missing');
s=s.replace(replayStrict,replayFlexible);

replacePatch(
  "insertBefore('  async handleMove(token, msg) {'",
  ", 'opening handlers');",
  `insertBefore('  async handleMove(token, msg) {', \`  async handleOpeningGuess(token, msg) {\\n    const room=this.room, auth=this.authToken(token);\\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\\n    const o=room.opening;\\n    if (!o || o.resolved || o.phase!=="guess" || auth.member.id!==o.actorId) throw new Error("目前不能猜單雙");\\n    const guess=msg?.guess==="odd"?"odd":msg?.guess==="even"?"even":null;\\n    if (!guess) throw new Error("請選擇單數或雙數");\\n    const correct=guess===o.secretParity;\\n    delete o.secretParity;\\n    if (o.guessRule==="direct_first") {\\n      const firstId=correct?o.actorId:o.holderId;\\n      assignOpeningSides(room,firstId,openingFirstSide(room.gameId));\\n      room.startedAt=room.startedAt||Date.now();\\n      this.startReplay();\\n    } else { o.phase="choose"; o.chooserId=correct?o.actorId:o.holderId; }\\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\\n  }\\n\\n  async handleOpeningChoose(token, msg) {\\n    const room=this.room, auth=this.authToken(token);\\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\\n    const o=room.opening;\\n    if (!o || o.resolved || o.phase!=="choose" || auth.member.id!==o.chooserId) throw new Error("目前不能選擇持色");\\n    const first=openingFirstSide(room.gameId), other=openingOtherSide(room.gameId,first), side=String(msg?.side||"");\\n    if (side!==first && side!==other) throw new Error("持色無效");\\n    assignOpeningSides(room,auth.member.id,side);\\n    room.startedAt=room.startedAt||Date.now();\\n    this.startReplay();\\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\\n  }\\n\\n  async handleOpeningHand(token, msg) {\\n    const room=this.room, auth=this.authToken(token);\\n    if (!room || room.status!=="playing" || !auth || auth.member.role!=="player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\\n    const o=room.opening;\\n    if (!o || o.resolved || o.phase!=="hand" || auth.member.id!==o.actorId) throw new Error("目前不能選手");\\n    const hand=msg?.hand==="left"?"left":msg?.hand==="right"?"right":null;\\n    if (!hand) throw new Error("請選左手或右手");\\n    const side=hand==="left"?o.leftSide:o.rightSide;\\n    delete o.leftSide; delete o.rightSide;\\n    assignOpeningSides(room,auth.member.id,side);\\n    room.startedAt=room.startedAt||Date.now();\\n    this.startReplay();\\n    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();\\n  }\\n\\n\`, 'opening handlers');`,
  'opening runtime patch'
);

replacePatch(
  "replaceBlock('  async handleMove(token, msg) {'",
  ", 'handleMove opening and banqi');",
  `replaceBlock('  async handleMove(token, msg) {', \`  async handleMove(token, msg) {\\n    const room = this.room;\\n    const auth = this.authToken(token);\\n    if (!room || room.status !== "playing") throw new Error("棋局尚未開始或已結束。");\\n    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");\\n    if (room.opening && !room.opening.resolved && room.gameId !== "banqi") throw new Error("猜先／分色尚未完成");\\n    if (room.gameId === "banqi") {\\n      const seat=room.seats.indexOf(auth.member.id);\\n      if (!room.game.assigned) { if (room.game.turnSeat!==seat) throw new Error("還沒輪到你翻第一子"); }\\n      else if (room.game.turn!==auth.member.side) throw new Error("還沒輪到你");\\n      const action={...msg,seat};\\n      const next=applyBanqi(room.game,auth.member.side,action);\\n      if (!next.ok) throw new Error(next.error || "暗棋走法不合法");\\n      room.game=next.game; room.rematchVotes=[];\\n      this.recordReplayAction(auth.member,action,"move");\\n      if (next.assignedSide && room.opening && !room.opening.resolved) {\\n        assignOpeningSides(room,auth.member.id,next.assignedSide);\\n        room.startedAt=room.startedAt||Date.now();\\n        if (room.currentReplay) room.currentReplay.players=room.seats.map((id)=>roomMemberById(room,id)).filter(Boolean).map((m)=>({memberId:m.id,name:m.name,side:m.side}));\\n      }\\n      if (next.game.ended) await this.finishMatch(next.game.result);\\n      else { await this.saveRoom(); await this.syncLobby(); await this.broadcastState(); }\\n      return;\\n    }\\n    const result = applyGameAction(room.game, auth.member.side, msg);\\n    this.recordReplayAction(auth.member, msg, "move");\\n    room.game = result.game; room.rematchVotes = [];\\n    if (result.ended) await this.finishMatch(result.result);\\n    else { await this.saveRoom(); await this.syncLobby(); await this.broadcastState(); }\\n  }\`, 'handleMove opening and banqi');`,
  'handle move runtime patch'
);

replacePatch(
  "mutateBlock('  async handlePass(token'",
  "}, 'handlePass opening guard');",
  `// Pass already routes through handleMove, whose opening guard blocks it before color allocation.`,
  'pass guard patch'
);

replacePatch(
  "mutateBlock('  async handleResign(token'",
  "}, 'handleResign opening guard');",
  `mutateBlock('  async resign(token) {', (block) => {\n  const needle='    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");';\n  if(!block.includes(needle)) throw new Error('resign status marker missing');\n  return block.replace(needle, needle+'\\n    if (room.opening && !room.opening.resolved) throw new Error("猜先／分色尚未完成");');\n}, 'resign opening guard');`,
  'resign guard patch'
);

replacePatch(
  "mutateBlock('  finishMatch(result) {'",
  "}, 'finish match end time');",
  `mutateBlock('  async finishMatch(result) {', (block) => {\n  const needle='    room.status = "finished";';\n  if(!block.includes(needle)) throw new Error('finishMatch status marker missing');\n  return block.replace(needle, needle+'\\n    room.endedAt = Date.now();');\n}, 'finish match end time');`,
  'finish time patch'
);

const startedNow='    room.startedAt = Date.now();';
if(!s.includes(startedNow)) throw new Error('maybeStartMatch startedAt marker missing');
s=s.replace(startedNow,'    room.startedAt = null;');
const randomAssign='      assignOpeningSides(room, first.id, openingFirstSide(room.gameId));\\n      this.startReplay();';
if(!s.includes(randomAssign)) throw new Error('random opening start marker missing');
s=s.replace(randomAssign,'      assignOpeningSides(room, first.id, openingFirstSide(room.gameId));\\n      room.startedAt=Date.now();\\n      this.startReplay();');

await writeFile(file, s, "utf8");
