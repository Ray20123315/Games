export function ensureDeadlines(feature) {
  if (!feature.deadlines || typeof feature.deadlines !== "object") feature.deadlines = {};
  return feature.deadlines;
}

export function setDeadline(feature, key, type, deadline, version, payload = null) {
  ensureDeadlines(feature)[key] = { key, type, deadline: Number(deadline), version: Number(version) || 0, payload };
}

export function cancelDeadline(feature, key) {
  if (feature?.deadlines) delete feature.deadlines[key];
}

export function nextDeadline(feature) {
  const list = Object.values(ensureDeadlines(feature)).filter((d) => Number.isFinite(d.deadline));
  if (!list.length) return null;
  return list.reduce((a, b) => a.deadline <= b.deadline ? a : b);
}

export function dueDeadlines(feature, now = Date.now()) {
  return Object.values(ensureDeadlines(feature)).filter((d) => Number.isFinite(d.deadline) && d.deadline <= now).sort((a, b) => a.deadline - b.deadline);
}

export function syncOfflineDeadlines(room, feature) {
  const active = new Set();
  for (const member of room?.members || []) {
    const key = `offline:${member.id}`;
    if (room.status === "playing" && member.role === "player" && room.seats?.includes(member.id) && !member.connected && Number.isFinite(member.offlineDeadline)) {
      setDeadline(feature, key, "player_offline", member.offlineDeadline, member.offlineMatchSeq || room.matchSeq || 0, { memberId: member.id, matchSeq: member.offlineMatchSeq || room.matchSeq || 0 });
      active.add(key);
    }
  }
  for (const key of Object.keys(ensureDeadlines(feature))) if (key.startsWith("offline:") && !active.has(key)) delete feature.deadlines[key];
}
