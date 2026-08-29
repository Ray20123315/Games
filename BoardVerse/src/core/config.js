export const APP_VERSION = "0.1.2";
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
export const GAME_IDS = Object.freeze(["go9", "go13", "go19", "gomoku", "renju", "xiangqi", "xiangqi_random", "banqi", "qiguo", "chess", "reversi"]);
export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_CHAT_TEXT = 300;
export const MAX_REPORT_TEXT = 2000;
export const USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
export const EMAIL_VERIFY_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_MS = 30 * 60 * 1000;
export const REPLAY_PUBLIC_MS = 7 * 24 * 60 * 60 * 1000;
export const REPLAY_DELETE_MS = 30 * 24 * 60 * 60 * 1000;
export const USER_COOKIE = "bv_session";
export const ADMIN_COOKIE = "bv_admin";
export const ADMIN_PLAYER_COOKIE = "bv_admin_player";
export const GUEST_COOKIE = "bv_guest";
export const STUN_URL = "stun:stun.cloudflare.com:3478";
export const TAIPEI_TIME_ZONE = "Asia/Taipei";
export const PBKDF2_ITERATIONS = 100000;
export const CLOCK_LIMITS = Object.freeze({
  mainMinMs: 10_000,
  mainMaxMs: 24 * 60 * 60 * 1000,
  incrementMaxMs: 10 * 60 * 1000,
  delayMaxMs: 10 * 60 * 1000,
  byoPeriodMinMs: 5_000,
  byoPeriodMaxMs: 10 * 60 * 1000,
  byoPeriodsMin: 1,
  byoPeriodsMax: 20,
});
export const CLOCK_PRESETS = Object.freeze({
  untimed: { mode: "untimed" },
  sudden10: { mode: "sudden_death", mainMs: 10 * 60_000 },
  fischer5_3: { mode: "fischer", mainMs: 5 * 60_000, incrementMs: 3_000 },
  fischer10_5: { mode: "fischer", mainMs: 10 * 60_000, incrementMs: 5_000 },
  go20_5x30: { mode: "japanese_byoyomi", mainMs: 20 * 60_000, byoPeriodMs: 30_000, byoPeriods: 5 },
  go30_5x30: { mode: "japanese_byoyomi", mainMs: 30 * 60_000, byoPeriodMs: 30_000, byoPeriods: 5 },
});
export const MEMBERSHIP_LEVELS = Object.freeze([
  { level: 1, name: "新進棋友", gp: 0, customRoomsPerDay: 1, ownerGraceMinutes: 10, presetSlots: 1 },
  { level: 2, name: "活躍棋友", gp: 250, customRoomsPerDay: 3, ownerGraceMinutes: 15, presetSlots: 2 },
  { level: 3, name: "熟練棋友", gp: 900, customRoomsPerDay: 5, ownerGraceMinutes: 20, presetSlots: 3 },
  { level: 4, name: "資深棋友", gp: 2200, customRoomsPerDay: 7, ownerGraceMinutes: 25, presetSlots: 5 },
  { level: 5, name: "榮耀棋友", gp: 5000, customRoomsPerDay: null, ownerGraceMinutes: 30, presetSlots: 10 },
]);
export const GP_RULES = Object.freeze({
  checkin: 10,
  streakStep: 2,
  streakBonusMax: 10,
  activeBlockSeconds: 600,
  activeGpPerBlock: 1,
  activeGpDailyMax: 12,
  completed: 3,
  win: 5,
  draw: 3,
  loss: 1,
  gamesDailyMax: 10,
  sameOpponentDailyMax: 3,
});
export const DEFAULT_ROOM_CHAT_SLOW_MS = 0;
export const MAX_ROOM_CHAT_SLOW_MS = 60_000;
