export function isSeatedPlayer(room, member) { return !!member && member.role === "player" && room?.seats?.includes(member.id); }
export function isOwner(room, member) { return !!member && member.id === room?.ownerId; }
export function otherPlayer(room, member) {
  if (!member) return null;
  const id = room.seats?.find((x) => x && x !== member.id);
  return room.members?.find((m) => m.id === id) || null;
}
export function assertPlayer(room, member) { if (!isSeatedPlayer(room, member)) throw new Error("此操作僅限目前兩位玩家。"); }
export function assertOwner(room, member) { if (!isOwner(room, member)) throw new Error("此操作僅限房主。"); }
