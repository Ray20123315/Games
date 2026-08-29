import { CLOCK_LIMITS } from "../core/config.js";

export const CLOCK_MODES = Object.freeze(["untimed", "sudden_death", "fischer", "bronstein_delay", "japanese_byoyomi"]);

function finite(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, finite(v, min))); }

export function normalizeClockConfig(input = {}) {
  const mode = CLOCK_MODES.includes(input.mode) ? input.mode : "untimed";
  if (mode === "untimed") return { mode };
  const out = { mode, mainMs: Math.round(clamp(input.mainMs, CLOCK_LIMITS.mainMinMs, CLOCK_LIMITS.mainMaxMs)) };
  if (mode === "fischer") out.incrementMs = Math.round(clamp(input.incrementMs ?? 0, 0, CLOCK_LIMITS.incrementMaxMs));
  if (mode === "bronstein_delay") out.delayMs = Math.round(clamp(input.delayMs ?? 0, 0, CLOCK_LIMITS.delayMaxMs));
  if (mode === "japanese_byoyomi") {
    out.byoPeriodMs = Math.round(clamp(input.byoPeriodMs, CLOCK_LIMITS.byoPeriodMinMs, CLOCK_LIMITS.byoPeriodMaxMs));
    out.byoPeriods = Math.round(clamp(input.byoPeriods, CLOCK_LIMITS.byoPeriodsMin, CLOCK_LIMITS.byoPeriodsMax));
  }
  return out;
}

export function createClock(configInput, players, activePlayer, now = Date.now()) {
  const config = normalizeClockConfig(configInput);
  const ids = [...players];
  const mainRemainingMs = Object.fromEntries(ids.map((p) => [p, config.mode === "untimed" ? null : config.mainMs]));
  const periodsRemaining = Object.fromEntries(ids.map((p) => [p, config.mode === "japanese_byoyomi" ? config.byoPeriods : null]));
  const clock = {
    mode: config.mode,
    activePlayer,
    turnStartedAt: now,
    mainRemainingMs,
    incrementMs: config.incrementMs || 0,
    delayMs: config.delayMs || 0,
    byoPeriodMs: config.byoPeriodMs || 0,
    periodsRemaining,
    clockDeadlineAt: null,
    revision: 1,
  };
  clock.clockDeadlineAt = computeDeadline(clock);
  return clock;
}

export function computeDeadline(clock) {
  if (!clock || clock.mode === "untimed" || !clock.activePlayer) return null;
  const p = clock.activePlayer;
  const main = Math.max(0, finite(clock.mainRemainingMs?.[p], 0));
  if (clock.mode === "sudden_death" || clock.mode === "fischer") return clock.turnStartedAt + main;
  if (clock.mode === "bronstein_delay") return clock.turnStartedAt + Math.max(0, finite(clock.delayMs)) + main;
  if (clock.mode === "japanese_byoyomi") {
    const periods = Math.max(0, Math.floor(finite(clock.periodsRemaining?.[p], 0)));
    return clock.turnStartedAt + main + periods * Math.max(0, finite(clock.byoPeriodMs));
  }
  return null;
}

export function settleActive(clockInput, now = Date.now()) {
  const clock = structuredClone(clockInput);
  if (!clock || clock.mode === "untimed" || !clock.activePlayer) return { clock, timedOut: false, elapsedMs: 0 };
  const p = clock.activePlayer;
  const elapsed = Math.max(0, now - finite(clock.turnStartedAt, now));
  let timedOut = false;
  if (clock.mode === "sudden_death" || clock.mode === "fischer") {
    const remain = Math.max(0, finite(clock.mainRemainingMs[p], 0));
    if (elapsed >= remain) { clock.mainRemainingMs[p] = 0; timedOut = true; }
    else clock.mainRemainingMs[p] = remain - elapsed;
  } else if (clock.mode === "bronstein_delay") {
    const charge = Math.max(0, elapsed - Math.max(0, finite(clock.delayMs)));
    const remain = Math.max(0, finite(clock.mainRemainingMs[p], 0));
    if (charge > 0 && charge >= remain) { clock.mainRemainingMs[p] = 0; timedOut = true; }
    else clock.mainRemainingMs[p] = Math.max(0, remain - charge);
  } else if (clock.mode === "japanese_byoyomi") {
    let main = Math.max(0, finite(clock.mainRemainingMs[p], 0));
    let overflow = elapsed;
    if (main > 0) {
      if (overflow < main) { clock.mainRemainingMs[p] = main - overflow; overflow = 0; }
      else { overflow -= main; clock.mainRemainingMs[p] = 0; }
    }
    if (overflow > 0 || main === 0) {
      const period = Math.max(1, finite(clock.byoPeriodMs, 1));
      let periods = Math.max(0, Math.floor(finite(clock.periodsRemaining[p], 0)));
      if (overflow >= periods * period) { periods = 0; timedOut = true; }
      else {
        const consumed = Math.floor(overflow / period);
        periods = Math.max(1, periods - consumed);
      }
      clock.periodsRemaining[p] = periods;
    }
  }
  clock.clockDeadlineAt = timedOut ? now : computeDeadline({ ...clock, turnStartedAt: now });
  return { clock, timedOut, elapsedMs: elapsed };
}

export function completeLegalMove(clockInput, nextActivePlayer, now = Date.now()) {
  const settled = settleActive(clockInput, now);
  if (settled.timedOut) return settled;
  const clock = settled.clock;
  const mover = clock.activePlayer;
  if (clock.mode === "fischer" && mover) clock.mainRemainingMs[mover] = Math.max(0, finite(clock.mainRemainingMs[mover])) + Math.max(0, finite(clock.incrementMs));
  clock.activePlayer = nextActivePlayer;
  clock.turnStartedAt = now;
  clock.revision = (Number(clock.revision) || 0) + 1;
  clock.clockDeadlineAt = computeDeadline(clock);
  return { clock, timedOut: false, elapsedMs: settled.elapsedMs };
}

export function publicClock(clock) {
  if (!clock) return null;
  return structuredClone(clock);
}
