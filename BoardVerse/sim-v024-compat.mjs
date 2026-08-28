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
  `replaceBlock('function roomView(room, token) {', \`function roomView(room, token) {\n  if (!room) return null;\n  const member = roomMemberByToken(room, token);\n  const role = member ? (member.role === "player" ? (member.isOwner ? "host" : "guest") : member.role) : "unknown";\n  const playerA = seatMember(room, 0), playerB = seatMember(room, 1);\n  const isOwner = !!member && member.id === room.ownerId;\n  const chat = member?.role === "player" ? room.playerChat : (["spectator", "queued"].includes(member?.role) ? room.spectatorChat : []);\n  return {\n    id: room.id, name: room.name, gameId: room.gameId, game: GAME_CATALOG[room.gameId],\n    rules: structuredClone(room.rules || normalizeRules(room.gameId, {})), rulesSummary: rulesSummary(room.gameId, room.rules || normalizeRules(room.gameId, {})),\n    ruleDefs: publicRuleDefs(room.gameId), privateRoom: room.privateRoom, status: room.status, role, rawRole: member?.role || "unknown",\n    createdAt:Number(room.createdAt)||null, startedAt:Number(room.startedAt)||null, endedAt:Number(room.endedAt)||null,\n    isHost: isOwner, myMemberId: member?.id || null, mySide: visibleMemberSide(room, member), mySeat: member ? room.seats.indexOf(member.id) : -1,\n    players: { host: publicMemberForRoom(room, playerA), guest: publicMemberForRoom(room, playerB) },\n    pending: isOwner ? room.pending.map((id) => publicMember(roomMemberById(room, id))).filter(Boolean) : [],\n    queue: room.queue.map((id, index) => ({ ...publicMember(roomMemberById(room, id)), position: index + 1 })).filter((x) => x.id),\n    spectatorCount: room.members.filter((m) => m.role === "spectator").length,\n    queueSettings: { ...room.settings },\n    gameState: publicGameState(room.game), result: room.result, resultSummary: resultSummary(room, token),\n    chat: Array.isArray(chat) ? chat.slice(-MAX_CHAT_HISTORY).map((m) => ({ id: m.id, memberId: m.memberId, name: m.name, role: m.role, side: m.side, text: m.text, at: m.at })) : [],\n    chatChannel: member?.role === "player" ? "players" : (["spectator", "queued"].includes(member?.role) ? "spectators" : "none"),\n    rematchVotes: member?.role === "player" ? room.rematchVotes.length : 0,\n    canSwap: member?.role === "player" && room.seats[1] === member.id && room.gameId === "gomoku" && !!room.game?.swapAvailable,\n    opening: publicOpening(room),\n    replays: member && member.role !== "pending" ? room.replays.slice(-MAX_REPLAY_HISTORY).reverse().map(replaySummary) : [],\n  };\n}\`, 'room view opening and timing');`,
  'room view patch'
);

const replayStrict = "replaceCount('initialGame:publicGameState(room.game)', 'initialGame:structuredClone(room.game)', 1, 'startReplay hidden-state source');";
const replayFlexible = "if (source.includes('initialGame:publicGameState(room.game)')) source = source.split('initialGame:publicGameState(room.game)').join('initialGame:structuredClone(room.game)');";
if(!s.includes(replayStrict)) throw new Error('compat replay source marker missing');
s=s.replace(replayStrict,replayFlexible);

await writeFile(file, s, "utf8");
