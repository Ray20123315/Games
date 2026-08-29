import { REPLAY_DELETE_MS, REPLAY_PUBLIC_MS } from "../core/config.js";
import { randomToken, sha256Hex } from "../core/crypto.js";
import { all, first, run } from "../core/db.js";

export async function archiveReplay(db, room, result, now = Date.now()) {
  const feature = room.bv;
  const rawToken = randomToken(24);
  const tokenHash = await sha256Hex(rawToken);
  const replayId = crypto.randomUUID();
  const players = (room.seats || []).map((id) => room.members?.find((m) => m.id === id)).filter(Boolean).map((m) => ({ memberId: m.id, userId: feature?.memberUsers?.[m.id] || null, name: m.name, side: m.side }));
  const startedAt = feature?.gameStartedAt || now;
  const publicUntil = now + REPLAY_PUBLIC_MS, deleteAfter = now + REPLAY_DELETE_MS;
  await run(db, `INSERT INTO replays(id,room_id,game_instance_id,public_token_hash,game_type,variant,players_json,result_json,time_control_json,finished_at,public_until,delete_after,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, replayId, room.id, feature?.gameInstanceId || String(room.matchSeq || ""), tokenHash, room.gameId, room.game?.type || null, JSON.stringify(players), JSON.stringify(result || null), JSON.stringify(feature?.clockConfig || { mode: "untimed" }), now, publicUntil, deleteAfter, now);
  const events = Array.isArray(feature?.events) ? feature.events.filter((e) => e?.gameInstanceId ? e.gameInstanceId === feature.gameInstanceId : true) : [];
  for (const e of events) {
    await run(db, `INSERT INTO replay_events(replay_id,seq,revision,event_type,actor,payload_json,server_timestamp) VALUES(?,?,?,?,?,?,?)`, replayId, e.seq, e.revision, e.type, e.actor == null ? null : JSON.stringify(e.actor), e.payload == null ? null : JSON.stringify(e.payload), e.serverTimestamp || now);
  }
  return { id: replayId, rawToken, publicUntil, deleteAfter, players, startedAt };
}

export async function publicReplayByToken(db, rawToken, now = Date.now()) {
  const hash = await sha256Hex(rawToken);
  const replay = await first(db, "SELECT * FROM replays WHERE public_token_hash=? AND public_until>=? LIMIT 1", hash, now);
  if (!replay) return null;
  return hydrateReplay(db, replay);
}

export async function replayById(db, id) {
  const replay = await first(db, "SELECT * FROM replays WHERE id=? LIMIT 1", id);
  return replay ? hydrateReplay(db, replay) : null;
}

export async function hydrateReplay(db, replay) {
  const events = await all(db, "SELECT seq,revision,event_type,actor,payload_json,server_timestamp FROM replay_events WHERE replay_id=? ORDER BY seq ASC", replay.id);
  return {
    ...replay,
    players: parseJson(replay.players_json, []),
    result: parseJson(replay.result_json, null),
    timeControl: parseJson(replay.time_control_json, { mode: "untimed" }),
    events: events.map((e) => ({ seq: e.seq, revision: e.revision, type: e.event_type, actor: parseJson(e.actor, null), payload: parseJson(e.payload_json, null), serverTimestamp: e.server_timestamp })),
  };
}

export async function listAdminReplays(db, { gameType = null, limit = 50, offset = 0, now = Date.now() } = {}) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 50)), off = Math.max(0, Number(offset) || 0);
  const rows = gameType
    ? await all(db, "SELECT id,room_id,game_type,variant,players_json,result_json,finished_at,public_until,delete_after FROM replays WHERE game_type=? ORDER BY finished_at DESC LIMIT ? OFFSET ?", gameType, lim, off)
    : await all(db, "SELECT id,room_id,game_type,variant,players_json,result_json,finished_at,public_until,delete_after FROM replays ORDER BY finished_at DESC LIMIT ? OFFSET ?", lim, off);
  return rows.map((row)=>({ ...row, lifecycle: Number(row.public_until)>=now ? "public" : Number(row.delete_after)<=now ? "deletion_due" : Number(row.delete_after)-now<=3*24*60*60_000 ? "deleting_soon" : "admin_only" }));
}

export async function cleanupReplayArchive(db, now = Date.now()) {
  let removed = 0;
  for (;;) {
    const ids = await all(db, "SELECT id FROM replays WHERE delete_after<=? LIMIT 500", now);
    if (!ids.length) return removed;
    for (const row of ids) {
      await run(db, "DELETE FROM replay_events WHERE replay_id=?", row.id);
      await run(db, "DELETE FROM replays WHERE id=?", row.id);
      removed += 1;
    }
    if (ids.length < 500) return removed;
  }
}

function parseJson(v, fallback) { try { return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
