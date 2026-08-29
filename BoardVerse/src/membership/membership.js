import { GP_RULES, MEMBERSHIP_LEVELS, TAIPEI_TIME_ZONE } from "../core/config.js";
import { all, first, run } from "../core/db.js";

export function taipeiDateKey(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TAIPEI_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function levelForGp(gp) {
  let result = MEMBERSHIP_LEVELS[0];
  for (const item of MEMBERSHIP_LEVELS) if (Number(gp) >= item.gp) result = item;
  return result;
}

export function levelPolicy(level) {
  return MEMBERSHIP_LEVELS.find((x) => x.level === Number(level)) || MEMBERSHIP_LEVELS[0];
}

export async function getUserMembership(db, userId) {
  const row = await first(db, "SELECT id,gp,level,reputation,unlimited_custom_room_id,custom_room_suspended_until,email_verified_at,status,suspended_until FROM users WHERE id=?", userId);
  if (!row) return null;
  return { ...row, policy: levelPolicy(row.level), levelInfo: levelPolicy(row.level) };
}

async function updateNaturalLevel(db, userId) {
  const user = await first(db, "SELECT gp,level FROM users WHERE id=?", userId);
  if (!user) return;
  const natural = levelForGp(user.gp).level;
  if (natural > Number(user.level || 1)) await run(db, "UPDATE users SET level=?,updated_at=? WHERE id=?", natural, Date.now(), userId);
}

export async function addGp(db, userId, amount, reason = "system") {
  const n = Math.trunc(Number(amount) || 0);
  if (!n) return;
  await run(db, "UPDATE users SET gp=MAX(0,gp+?),updated_at=? WHERE id=?", n, Date.now(), userId);
  await run(db, "INSERT INTO gp_events(id,user_id,amount,reason,created_at) VALUES(?,?,?,?,?)", crypto.randomUUID(), userId, n, reason, Date.now());
  if (n > 0) await updateNaturalLevel(db, userId);
}

export async function checkIn(db, userId, now = Date.now()) {
  const dateKey = taipeiDateKey(now);
  const user = await first(db, "SELECT email_verified_at,status,suspended_until,gp,level FROM users WHERE id=?", userId);
  if (!user?.email_verified_at || user.status !== "active") throw new Error("帳號尚未完成 Email 驗證或目前不可使用。");
  const old = await first(db, "SELECT last_checkin_date,streak_days FROM user_checkin_state WHERE user_id=?", userId);
  if (old?.last_checkin_date === dateKey) return { already: true, awarded: 0, dateKey, streak: old.streak_days, gp: user.gp, level: user.level };
  const yesterday = taipeiDateKey(now - 24 * 60 * 60 * 1000);
  const streak = old?.last_checkin_date === yesterday ? Number(old.streak_days || 0) + 1 : 1;
  const bonus = Math.min(GP_RULES.streakBonusMax, Math.max(0, streak - 1) * GP_RULES.streakStep);
  const awarded = GP_RULES.checkin + bonus;
  await run(db, `INSERT INTO user_checkin_state(user_id,last_checkin_date,streak_days) VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET last_checkin_date=excluded.last_checkin_date,streak_days=excluded.streak_days`, userId, dateKey, streak);
  await run(db, `INSERT INTO daily_user_stats(user_id,date_key,checkin_done,active_seconds,active_gp_awarded,valid_games_count,custom_room_count,last_activity_at)
    VALUES(?,?,1,0,0,0,0,?) ON CONFLICT(user_id,date_key) DO UPDATE SET checkin_done=1`, userId, dateKey, now);
  await addGp(db, userId, awarded, "daily_checkin");
  const updated = await first(db, "SELECT gp,level FROM users WHERE id=?", userId);
  return { already: false, awarded, dateKey, streak, gp: updated.gp, level: updated.level };
}

export async function noteActivity(db, userId, now = Date.now()) {
  const dateKey = taipeiDateKey(now);
  const row = await first(db, "SELECT active_seconds,active_gp_awarded,last_activity_at FROM daily_user_stats WHERE user_id=? AND date_key=?", userId, dateKey);
  const oldSeconds = Number(row?.active_seconds || 0);
  const oldAwarded = Number(row?.active_gp_awarded || 0);
  const last = Number(row?.last_activity_at || now);
  const delta = Math.max(0, Math.min(300, Math.floor((now - last) / 1000)));
  const seconds = oldSeconds + delta;
  const possible = Math.min(GP_RULES.activeGpDailyMax, Math.floor(seconds / GP_RULES.activeBlockSeconds) * GP_RULES.activeGpPerBlock);
  const award = Math.max(0, possible - oldAwarded);
  await run(db, `INSERT INTO daily_user_stats(user_id,date_key,checkin_done,active_seconds,active_gp_awarded,valid_games_count,custom_room_count,last_activity_at)
    VALUES(?,?,0,?,?,0,0,?) ON CONFLICT(user_id,date_key) DO UPDATE SET active_seconds=excluded.active_seconds,active_gp_awarded=excluded.active_gp_awarded,last_activity_at=excluded.last_activity_at`, userId, dateKey, seconds, possible, now);
  if (award) await addGp(db, userId, award, "active_time");
  return { seconds, awarded: award };
}

export async function canCreateCustomRoom(db, user) {
  if (!user?.email_verified_at || user.status !== "active") return { ok: false, reason: "請先登入已驗證帳號。" };
  if (Number(user.custom_room_suspended_until || 0) > Date.now()) return { ok: false, reason: "自訂房號權限目前被暫停。" };
  if (user.unlimited_custom_room_id) return { ok: true, unlimited: true, policy: levelPolicy(user.level) };
  const policy = levelPolicy(user.level);
  if (policy.customRoomsPerDay == null) return { ok: true, unlimited: true, policy };
  const dateKey = taipeiDateKey();
  const stats = await first(db, "SELECT custom_room_count FROM daily_user_stats WHERE user_id=? AND date_key=?", user.id, dateKey);
  const used = Number(stats?.custom_room_count || 0);
  return used < policy.customRoomsPerDay ? { ok: true, used, limit: policy.customRoomsPerDay, policy } : { ok: false, used, limit: policy.customRoomsPerDay, policy, reason: "今天的自訂房號額度已用完。" };
}

export async function consumeCustomRoom(db, userId, now = Date.now()) {
  const dateKey = taipeiDateKey(now);
  await run(db, `INSERT INTO daily_user_stats(user_id,date_key,checkin_done,active_seconds,active_gp_awarded,valid_games_count,custom_room_count,last_activity_at)
    VALUES(?,?,0,0,0,0,1,?) ON CONFLICT(user_id,date_key) DO UPDATE SET custom_room_count=custom_room_count+1,last_activity_at=excluded.last_activity_at`, userId, dateKey, now);
}

export async function listPresets(db, userId) {
  return all(db, "SELECT id,name,config_json,created_at,updated_at FROM room_presets WHERE user_id=? ORDER BY updated_at DESC", userId);
}

export async function savePreset(db, user, { id = null, name, config }) {
  const policy = levelPolicy(user.level);
  const cleanName = String(name || "").trim().slice(0, 40);
  if (!cleanName) throw new Error("Preset 名稱不能空白。");
  const safe = stripPresetSecrets(structuredClone(config || {}));
  if (JSON.stringify(safe).length > 16_000) throw new Error("Preset 內容過大。");
  if (!id) {
    const count = await first(db, "SELECT COUNT(*) AS n FROM room_presets WHERE user_id=?", user.id);
    if (Number(count?.n || 0) >= policy.presetSlots) throw new Error(`目前等級最多可保存 ${policy.presetSlots} 組 Preset。`);
    id = crypto.randomUUID();
    await run(db, "INSERT INTO room_presets(id,user_id,name,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?)", id, user.id, cleanName, JSON.stringify(safe), Date.now(), Date.now());
  } else {
    await run(db, "UPDATE room_presets SET name=?,config_json=?,updated_at=? WHERE id=? AND user_id=?", cleanName, JSON.stringify(safe), Date.now(), id, user.id);
  }
  return { id, name: cleanName, config: safe };
}

export async function deletePreset(db, userId, presetId) {
  const result = await run(db, "DELETE FROM room_presets WHERE id=? AND user_id=?", String(presetId || ""), userId);
  return { deleted: Number(result?.meta?.changes || result?.changes || 0) > 0 };
}

export async function awardGameGp(db, { userId, opponentUserId, outcome, finishedNormally = true, durationMs = null, now = Date.now() }) {
  if (!finishedNormally || !userId) return { awarded: 0, eligible: false };
  const user = await first(db, "SELECT id,email_verified_at,status FROM users WHERE id=?", userId);
  if (!user?.email_verified_at || user.status !== "active") return { awarded: 0, eligible: false };
  const dateKey = taipeiDateKey(now);
  const stats = await first(db, "SELECT valid_games_count FROM daily_user_stats WHERE user_id=? AND date_key=?", userId, dateKey);
  if (Number(stats?.valid_games_count || 0) >= GP_RULES.gamesDailyMax) return { awarded: 0, eligible: false, reason: "daily_cap" };
  if (opponentUserId) {
    const pair = await first(db, "SELECT gp_eligible_games,total_games FROM opponent_daily_gp WHERE user_id=? AND opponent_user_id=? AND date_key=?", userId, opponentUserId, dateKey);
    const eligibleGames = Number(pair?.gp_eligible_games || 0);
    const totalGames = Number(pair?.total_games || 0) + 1;
    await run(db, `INSERT INTO opponent_daily_gp(user_id,opponent_user_id,date_key,gp_eligible_games,total_games)
      VALUES(?,?,?,?,?) ON CONFLICT(user_id,opponent_user_id,date_key) DO UPDATE SET total_games=excluded.total_games`, userId, opponentUserId, dateKey, eligibleGames, totalGames);
    if (eligibleGames >= GP_RULES.sameOpponentDailyMax) {
      if (totalGames >= 8) await maybeRiskFlag(db, userId, "suspicious_boosting", { opponentUserId, dateKey, totalGames, reason: "high_repeat_pair" });
      return { awarded: 0, eligible: false, reason: "same_opponent_cap" };
    }
    await run(db, "UPDATE opponent_daily_gp SET gp_eligible_games=gp_eligible_games+1 WHERE user_id=? AND opponent_user_id=? AND date_key=?", userId, opponentUserId, dateKey);
  }
  let award = GP_RULES.completed;
  if (outcome === "win") award += GP_RULES.win;
  else if (outcome === "draw") award += GP_RULES.draw;
  else award += GP_RULES.loss;
  await run(db, `INSERT INTO daily_user_stats(user_id,date_key,checkin_done,active_seconds,active_gp_awarded,valid_games_count,custom_room_count,last_activity_at)
    VALUES(?,?,0,0,0,1,0,?) ON CONFLICT(user_id,date_key) DO UPDATE SET valid_games_count=valid_games_count+1,last_activity_at=excluded.last_activity_at`, userId, dateKey, now);
  await addGp(db, userId, award, `game_${outcome}`);
  if (Number(durationMs) > 0 && Number(durationMs) < 20_000) await maybeRiskFlag(db, userId, "suspicious_boosting", { opponentUserId, durationMs, reason: "very_short_game" });
  return { awarded: award, eligible: true };
}

async function maybeRiskFlag(db, userId, type, evidence) {
  const recent = await first(db, "SELECT id FROM risk_flags WHERE user_id=? AND type=? AND created_at>? LIMIT 1", userId, type, Date.now() - 6 * 60 * 60 * 1000);
  if (recent) return;
  await run(db, "INSERT INTO risk_flags(id,user_id,type,severity_hint,evidence_json,status,created_at,reviewed_at) VALUES(?,?,?,?,?,'open',?,NULL)", crypto.randomUUID(), userId, type, "medium", JSON.stringify(evidence), Date.now());
}


function stripPresetSecrets(value) {
  const forbidden = new Set(["roomid","customroomcode","password","returnpassword","session","token","email","admin","secret","authorization"]);
  if (Array.isArray(value)) return value.map(stripPresetSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key,val] of Object.entries(value)) {
    if (forbidden.has(String(key).toLowerCase())) continue;
    out[key] = stripPresetSecrets(val);
  }
  return out;
}
