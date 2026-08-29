import { DurableObject } from "cloudflare:workers";

/*
BoardVerse - single-file Cloudflare Workers multiplayer board-game MVP.

Cloudflare platform metadata still required outside this JavaScript file:
- Durable Object binding name: ROOMS
- Durable Object class: GameRoom
- Durable Object storage: sqlite
- Use a current compatibility date.

Current Wrangler JSON shape (2026-08):
{
  "durable_objects": {"bindings": [{"name":"ROOMS","class_name":"GameRoom"}]},
  "exports": {"GameRoom":{"type":"durable-object","storage":"sqlite"}}
}
*/

const APP_VERSION = "0.0.23";
const MAX_CHAT_TEXT = 300;
const MAX_CHAT_HISTORY = 100;
const MAX_REPLAY_HISTORY = 12;
const MAX_REPLAY_ACTIONS = 1200;
const ROOM_CODE_RE = /^[A-Z2-9]{6}$/;
const MAX_TEXT = 40;
const MAX_WS_MESSAGE = 8 * 1024;
const OFFLINE_FORFEIT_MS = 60 * 1000;
const LOBBY_NAME = "__BOARDVERSE_LOBBY__";

const GAME_CATALOG = {
  go9: {
    id: "go9",
    family: "go",
    title: "圍棋 9×9",
    short: "快速圍棋",
    description: "9×9 小棋盤，採中國數子式面積計分、貼目 7.5、禁止自殺與簡單劫。連續兩次虛手後結算。",
  },
  go13: {
    id: "go13",
    family: "go",
    title: "圍棋 13×13",
    short: "中型圍棋",
    description: "13×13 棋盤；規則同 9×9。適合比 19 路更快、又保留布局感的對局。",
  },
  go19: {
    id: "go19",
    family: "go",
    title: "圍棋 19×19",
    short: "標準圍棋",
    description: "19×19 標準棋盤，採中國面積計分與簡單劫。MVP 不含終局死子協商與超級劫。",
  },
  gomoku: {
    id: "gomoku",
    family: "gomoku",
    title: "五子棋",
    short: "自由五子棋",
    description: "15×15，自由規則；黑白雙方先形成連續五子或以上即勝，沒有禁手。",
  },
  renju: {
    id: "renju",
    family: "renju",
    title: "連珠 Renju",
    short: "黑方有禁手",
    description: "15×15。黑方五連恰好為勝、長連禁手；並檢查雙四與雙活三。MVP 的雙三／雙四採直線威脅近似判定，未涵蓋國際連珠規則所有假禁手例外。",
  },
  xiangqi: {
    id: "xiangqi",
    family: "xiangqi",
    title: "象棋",
    short: "中國象棋",
    description: "標準 9×10 棋盤，含將帥照面、馬腿、象眼、炮架、過河兵與王手合法性檢查；無合法步時判負。",
  },
  chess: {
    id: "chess",
    family: "chess",
    title: "西洋棋",
    short: "標準西洋棋",
    description: "含王車易位、吃過路兵、升變與將軍／將死／逼和。MVP 尚未自動判定三次重複、五十回合與子力不足和棋。",
  },
  reversi: {
    id: "reversi",
    family: "reversi",
    title: "黑白棋 Reversi",
    short: "翻轉棋",
    description: "8×8。落子必須夾住並翻轉至少一列對手棋子；無棋可下會自動跳過，雙方皆無棋可下時比棋子數。",
  },
};

const RULE_DEFS = {
  go: {
    defaults: { ruleset: "chinese", scoring: "area", komi: 7.5, koRule: "simple", suicide: false, mode: "standard", captureGoal: 1, handicap: 0 },
    fields: [
      { key:"ruleset", label:"規則集", type:"select", options:[["chinese","中國規則"],["japanese","日本規則"],["aga","AGA 規則"],["newzealand","紐西蘭規則"]], help:"規則集會帶入常見預設，但房主仍可細調計分、劫、自殺與貼目。" },
      { key:"scoring", label:"終局計分", type:"select", options:[["area","Area 面積計分"],["territory","Territory 地計分"]], help:"面積計分主要計活棋＋領地；地計分主要計領地＋提子。此版本不做終局死子協商，因此地計分採目前盤面與提子數直接結算。" },
      { key:"komi", label:"貼目 Komi", type:"number", min:0, max:20, step:0.5, help:"白棋因後手取得補償。可設定 0～20，支援 0.5 間隔。" },
      { key:"koRule", label:"劫規則", type:"select", options:[["simple","Simple Ko 簡單劫"],["superko","Positional Superko 盤面超劫"]], help:"簡單劫只禁止立即回復上一盤面；盤面超劫禁止重現本局任何先前盤面。" },
      { key:"suicide", label:"允許自殺著", type:"checkbox", help:"關閉時禁止自己整團無氣且未提子的落子；開啟後會依紐西蘭式處理，把無氣的己方棋串移除。" },
      { key:"mode", label:"對局模式", type:"select", options:[["standard","標準圍棋"],["capture","Capture Go 吃子棋"]], help:"標準圍棋以雙方 Pass 後計分；Capture Go 達到指定提子數立即獲勝，適合快速教學。" },
      { key:"captureGoal", label:"吃子棋目標", type:"number", min:1, max:20, step:1, when:{mode:"capture"}, help:"Capture Go 中先累積提掉指定數量敵子的一方立即獲勝。" },
      { key:"handicap", label:"讓子", type:"number", min:0, max:9, step:1, help:"0 為分先；2～9 會依棋盤星位預先放置黑子並由白先。1 子不預放，視為黑先無貼目慣例的簡化設定。" },
    ],
    extraHelp:"Pair Go 需要四個玩家席位；目前 BoardVerse 房間是兩席制，因此不會把它做成假選項。"
  },
  gomoku: {
    defaults: { variant:"freestyle", boardSize:15, opening:"none" },
    fields: [
      { key:"variant", label:"勝利規則", type:"select", options:[["freestyle","Freestyle 五子以上"],["exact5","Exact-Five 精確五連"],["connect6","Connect6 六子棋"]], help:"Freestyle 五顆以上皆勝；Exact-Five 必須剛好五顆；Connect6 目標六連，第一手黑下一顆，之後每回合連下兩顆。" },
      { key:"boardSize", label:"棋盤大小", type:"select", options:[[15,"15×15"],[19,"19×19"]], help:"一般競技五子棋常見 15×15；也可使用 19×19。" },
      { key:"opening", label:"開局平衡", type:"select", options:[["none","無限制"],["pro","Pro：黑首手中心、第三手離中心區"],["swap","Swap：第一手後白可交換持色"]], help:"Pro 以落子區域限制降低黑先優勢；Swap 允許原白方在第一手後交換黑白持色。Swap2 需要更複雜的三子／兩子候選流程，本版不會偽裝已支援。" },
    ],
    extraHelp:"Swap2 與完整競賽開局協議會在後續擴充；目前只顯示實際由伺服器 enforce 的選項。"
  },
  renju: {
    defaults: { opening:"free" },
    fields: [
      { key:"opening", label:"開局規則", type:"select", options:[["free","自由開局（目前可完整執行）"]], help:"黑方仍受長連、雙四、雙活三禁手；正式 Taraguchi-10、Soosyrv-8、Yamaguchi 涉及多次 Swap 與第五手候選提案，需專用 opening-state UI 才能正確執行。" },
    ],
    extraHelp:"Taraguchi-10、Soosyrv-8、Yamaguchi 已列入規則介紹，但本版不提供可選假功能；等 opening-state 完整實作後才會開放。"
  },
  xiangqi: {
    defaults: { stalemateLoss:true },
    fields: [
      { key:"stalemateLoss", label:"困斃判負", type:"checkbox", help:"標準象棋中輪到一方卻完全沒有合法著法時，該方負；這和西洋棋 Stalemate 判和不同。" },
    ],
    extraHelp:"暗棋 Banqi、揭棋 Jieqi、Janggi 需要不同棋盤／隱藏資訊或走法引擎，會以獨立遊戲模式加入，不會只靠一個開關冒充。"
  },
  chess: {
    defaults: { variant:"standard", threefold:true, fiftyMove:true, insufficient:true },
    fields: [
      { key:"variant", label:"對局變種", type:"select", options:[["standard","標準西洋棋"],["threecheck","Three-Check 三將棋"],["koth","King of the Hill 王者登峰"]], help:"Three-Check 除將死外，先累積三次將軍也勝；King of the Hill 的王安全進入 d4/e4/d5/e5 也勝。" },
      { key:"threefold", label:"三次重複可和棋", type:"checkbox", help:"開啟時同一局面第三次出現會自動判和，作為線上房間的簡化自動裁決。" },
      { key:"fiftyMove", label:"50-move Rule", type:"checkbox", help:"連續 100 個 ply 沒有兵移動也沒有吃子時自動判和。正式 FIDE 是可申請；此線上房間採自動裁決。" },
      { key:"insufficient", label:"子力不足自動和棋", type:"checkbox", help:"目前檢查 K vs K、K+B vs K、K+N vs K，以及只有同色格 Bishop 的基本死局。" },
    ],
    extraHelp:"Chess960、Crazyhouse、Atomic、Antichess 需要額外的起始局面、持駒／爆炸／強制吃子引擎；Bughouse 更需要四席＋雙棋盤。這些會在引擎完成時才開放。"
  },
  reversi: {
    defaults: { boardSize:8, objective:"normal" },
    fields: [
      { key:"boardSize", label:"棋盤大小", type:"select", options:[[6,"6×6"],[8,"8×8 標準"],[10,"10×10 Grand"]], help:"走法相同，只改變棋盤大小與終局計算空間。" },
      { key:"objective", label:"勝利條件", type:"select", options:[["normal","標準：棋子多者勝"],["misere","Anti-Othello：棋子少者勝"]], help:"Misère／Anti-Othello 會反轉終局目標：雙方無合法步後，棋子較少的一方獲勝。" },
    ],
    extraHelp:"所有尺寸仍遵守『有合法著就不能 Pass；沒合法著自動跳過』。"
  }
};

function gameFamily(gameId) { return GAME_CATALOG[gameId]?.family || ""; }
function clampNumber(v, min, max, fallback, step = null) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fallback;
  n = Math.max(min, Math.min(max, n));
  if (step) n = Math.round(n / step) * step;
  return n;
}
function normalizeRules(gameId, input = {}) {
  const family = gameFamily(gameId);
  const def = RULE_DEFS[family];
  const src = input && typeof input === "object" ? input : {};
  if (!def) return {};
  const out = structuredClone(def.defaults);
  if (family === "go") {
    if (["chinese","japanese","aga","newzealand"].includes(src.ruleset)) out.ruleset = src.ruleset;
    const presets = {
      chinese:{scoring:"area",komi:7.5,koRule:"simple",suicide:false},
      japanese:{scoring:"territory",komi:6.5,koRule:"simple",suicide:false},
      aga:{scoring:"area",komi:7.5,koRule:"superko",suicide:false},
      newzealand:{scoring:"area",komi:7,koRule:"superko",suicide:true},
    };
    Object.assign(out, presets[out.ruleset]);
    if (["area","territory"].includes(src.scoring)) out.scoring = src.scoring;
    if (["simple","superko"].includes(src.koRule)) out.koRule = src.koRule;
    if (typeof src.suicide === "boolean") out.suicide = src.suicide;
    out.komi = clampNumber(src.komi, 0, 20, out.komi, .5);
    if (["standard","capture"].includes(src.mode)) out.mode = src.mode;
    out.captureGoal = Math.round(clampNumber(src.captureGoal, 1, 20, 1, 1));
    out.handicap = Math.round(clampNumber(src.handicap, 0, 9, 0, 1));
  } else if (family === "gomoku") {
    if (["freestyle","exact5","connect6"].includes(src.variant)) out.variant = src.variant;
    out.boardSize = [15,19].includes(Number(src.boardSize)) ? Number(src.boardSize) : 15;
    if (["none","pro","swap"].includes(src.opening)) out.opening = src.opening;
    if (out.variant === "connect6" && out.opening !== "none") out.opening = "none";
  } else if (family === "renju") {
    out.opening = "free";
  } else if (family === "xiangqi") {
    if (typeof src.stalemateLoss === "boolean") out.stalemateLoss = src.stalemateLoss;
  } else if (family === "chess") {
    if (["standard","threecheck","koth"].includes(src.variant)) out.variant = src.variant;
    for (const k of ["threefold","fiftyMove","insufficient"]) if (typeof src[k] === "boolean") out[k] = src[k];
  } else if (family === "reversi") {
    out.boardSize = [6,8,10].includes(Number(src.boardSize)) ? Number(src.boardSize) : 8;
    if (["normal","misere"].includes(src.objective)) out.objective = src.objective;
  }
  return out;
}
function ruleValueLabel(family, fieldKey, value) {
  const field = RULE_DEFS[family]?.fields.find((f) => f.key === fieldKey);
  const hit = field?.options?.find((o) => String(o[0]) === String(value));
  if (hit) return hit[1];
  if (typeof value === "boolean") return value ? "開啟" : "關閉";
  return String(value);
}
function rulesSummary(gameId, rules) {
  const family = gameFamily(gameId), def = RULE_DEFS[family];
  if (!def) return "";
  return def.fields.filter((f) => !f.when || rules[f.when ? Object.keys(f.when)[0] : ""] === Object.values(f.when || {})[0])
    .map((f) => f.label + "：" + ruleValueLabel(family, f.key, rules[f.key])).join(" · ");
}
function publicRuleDefs(gameId) {
  const family = gameFamily(gameId), def = RULE_DEFS[family];
  return def ? structuredClone({family, fields:def.fields, extraHelp:def.extraHelp}) : {family,fields:[],extraHelp:""};
}


function cleanText(value, fallback = "玩家") {
  const s = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_TEXT);
  return s || fallback;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

function fail(message, status = 400, code = "bad_request") {
  return json({ ok: false, error: code, message }, status);
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function roomStub(env, roomId) {
  if (!env.ROOMS) throw new Error("缺少 Durable Object binding：ROOMS → GameRoom");
  return env.ROOMS.getByName(roomId);
}

async function parseJsonRequest(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("請使用 application/json");
  return request.json();
}

const SERVICE_WORKER_JS = `self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) {
        try { await client.navigate(url); } catch {}
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});`;

function normalizeNameKey(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function cleanPlayerName(value) {
  const s = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").normalize("NFKC").trim().slice(0, MAX_TEXT);
  if (!s) throw new Error("名稱不能是空白。");
  return s;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveReturnPassword(password, saltB64) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: base64ToBytes(saltB64),
    iterations: 100000,
    hash: "SHA-256",
  }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function makePasswordRecord(password) {
  const text = String(password ?? "");
  if (!text) return { passwordSalt: null, passwordHash: null };
  if (text.length > 128) throw new Error("回場密碼最多 128 個字元。");
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const passwordSalt = bytesToBase64(saltBytes);
  const passwordHash = await deriveReturnPassword(text, passwordSalt);
  return { passwordSalt, passwordHash };
}

async function verifyPasswordRecord(member, password) {
  if (!member?.passwordHash || !member?.passwordSalt) return false;
  if (!String(password ?? "")) return false;
  const candidate = await deriveReturnPassword(password, member.passwordSalt);
  try {
    return crypto.subtle.timingSafeEqual(
      new TextEncoder().encode(candidate),
      new TextEncoder().encode(member.passwordHash),
    );
  } catch {
    return candidate === member.passwordHash;
  }
}

function defaultRoomSettings(input = {}) {
  return {
    queueEnabled: !!input.queueEnabled,
    rotationPolicy: ["winner_stays", "rotate_both", "host_stays"].includes(input.rotationPolicy) ? input.rotationPolicy : "winner_stays",
  };
}

function newMemberBase(name, credentials, extra = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name,
    nameKey: normalizeNameKey(name),
    passwordSalt: credentials?.passwordSalt || null,
    passwordHash: credentials?.passwordHash || null,
    role: extra.role || "spectator",
    side: extra.side || null,
    connected: false,
    offlineSince: null,
    offlineDeadline: null,
    offlineMatchSeq: null,
    isOwner: !!extra.isOwner,
    joinedAt: now,
    updatedAt: now,
  };
}

function roomMemberById(room, id) {
  return Array.isArray(room?.members) ? room.members.find((m) => m.id === id) || null : null;
}

function roomMemberByToken(room, token) {
  return Array.isArray(room?.members) ? room.members.find((m) => m.token === token) || null : null;
}

function seatMember(room, seatIndex) {
  return roomMemberById(room, room?.seats?.[seatIndex] || null);
}

function publicMember(member) {
  return member ? {
    id: member.id,
    name: member.name,
    side: member.side || null,
    connected: !!member.connected,
    offlineDeadline: Number.isFinite(member.offlineDeadline) ? member.offlineDeadline : null,
    isOwner: !!member.isOwner,
    role: member.role,
  } : null;
}

function migrateRoomState(room) {
  if (!room || typeof room !== "object") return { room: null, changed: false };
  let changed = false;
  if (!Array.isArray(room.members) || !Array.isArray(room.seats)) {
    const members = [];
    const seats = [null, null];
    const now = Date.now();
    if (room.host) {
      const m = {
        id: crypto.randomUUID(), token: room.host.token || crypto.randomUUID(), name: cleanText(room.host.name),
        nameKey: normalizeNameKey(room.host.name), passwordSalt: null, passwordHash: null,
        role: "player", side: room.host.side || sideFor(room.gameId, 0), connected: !!room.host.connected,
        offlineSince: null, offlineDeadline: null, offlineMatchSeq: null,
        isOwner: true, joinedAt: room.createdAt || now, updatedAt: now,
      };
      members.push(m); seats[0] = m.id; room.ownerId = m.id;
    }
    if (room.guest) {
      const m = {
        id: crypto.randomUUID(), token: room.guest.token || crypto.randomUUID(), name: cleanText(room.guest.name),
        nameKey: normalizeNameKey(room.guest.name), passwordSalt: null, passwordHash: null,
        role: "player", side: room.guest.side || sideFor(room.gameId, 1), connected: !!room.guest.connected,
        offlineSince: null, offlineDeadline: null, offlineMatchSeq: null,
        isOwner: false, joinedAt: room.createdAt || now, updatedAt: now,
      };
      members.push(m); seats[1] = m.id;
    }
    const pendingIds = [];
    for (const old of Array.isArray(room.pending) ? room.pending : []) {
      const m = {
        id: old.id || crypto.randomUUID(), token: old.token || crypto.randomUUID(), name: cleanText(old.name),
        nameKey: normalizeNameKey(old.name), passwordSalt: null, passwordHash: null,
        role: "pending", side: null, connected: false, offlineSince: null, offlineDeadline: null, offlineMatchSeq: null, isOwner: false,
        joinedAt: old.createdAt || now, updatedAt: now,
      };
      members.push(m); pendingIds.push(m.id);
    }
    room.members = members;
    room.seats = seats;
    room.pending = pendingIds;
    room.queue = [];
    room.settings = defaultRoomSettings(room.settings || {});
    room.playerChat = Array.isArray(room.chat) ? room.chat : [];
    room.spectatorChat = [];
    room.chatSeq = Number.isInteger(room.chatSeq) ? room.chatSeq : room.playerChat.length;
    delete room.host;
    delete room.guest;
    delete room.chat;
    changed = true;
  }
  if (!room.settings) { room.settings = defaultRoomSettings(); changed = true; }
  else {
    const normalized = defaultRoomSettings(room.settings);
    if (JSON.stringify(normalized) !== JSON.stringify(room.settings)) { room.settings = normalized; changed = true; }
  }
  if (!Array.isArray(room.members)) { room.members = []; changed = true; }
  if (!Array.isArray(room.seats) || room.seats.length !== 2) { room.seats = [null, null]; changed = true; }
  if (!Array.isArray(room.pending)) { room.pending = []; changed = true; }
  if (!Array.isArray(room.queue)) { room.queue = []; changed = true; }
  if (!Array.isArray(room.playerChat)) { room.playerChat = []; changed = true; }
  if (!Array.isArray(room.spectatorChat)) { room.spectatorChat = []; changed = true; }
  if (!Number.isInteger(room.chatSeq)) { room.chatSeq = room.playerChat.length + room.spectatorChat.length; changed = true; }
  if (!room.ownerId) {
    const owner = room.members.find((m) => m.isOwner) || roomMemberById(room, room.seats[0]);
    if (owner) { owner.isOwner = true; room.ownerId = owner.id; changed = true; }
  }
  for (const member of room.members) {
    const normalizedKey = normalizeNameKey(member.name);
    if (member.nameKey !== normalizedKey) { member.nameKey = normalizedKey; changed = true; }
    if (member.id === room.ownerId && !member.isOwner) { member.isOwner = true; changed = true; }
    if (typeof member.connected !== "boolean") { member.connected = false; changed = true; }
    if (!Number.isFinite(member.offlineSince)) { if (member.offlineSince != null) changed = true; member.offlineSince = null; }
    if (!Number.isFinite(member.offlineDeadline)) { if (member.offlineDeadline != null) changed = true; member.offlineDeadline = null; }
    if (!Number.isInteger(member.offlineMatchSeq)) { if (member.offlineMatchSeq != null) changed = true; member.offlineMatchSeq = null; }
  }
  if (!Array.isArray(room.replays)) { room.replays = []; changed = true; }
  if (room.replays.length > MAX_REPLAY_HISTORY) { room.replays = room.replays.slice(-MAX_REPLAY_HISTORY); changed = true; }
  if (!("currentReplay" in room)) { room.currentReplay = null; changed = true; }
  if (room.status === "playing" && !room.currentReplay && room.game) {
    const players = room.seats.map((id) => roomMemberById(room, id)).filter(Boolean).map((m) => ({ memberId:m.id, name:m.name, side:m.side }));
    room.currentReplay = { id:String(Number(room.matchSeq)||1), matchSeq:Number(room.matchSeq)||1, gameId:room.gameId, rules:structuredClone(room.rules || normalizeRules(room.gameId, {})), startedAt:Date.now(), players, initialGame:publicGameState(room.game), actions:[], partial:true };
    changed = true;
  }
  return { room, changed };
}

function htmlResponse() {
  return new Response(APP_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomPath = url.pathname.match(/^\/([A-Z2-9]{6})\/?$/);

    if (request.method === "GET" && (url.pathname === "/" || roomPath)) return htmlResponse();
    if (request.method === "GET" && url.pathname === "/sw.js") {
      return new Response(SERVICE_WORKER_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "service-worker-allowed": "/" } });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, app: "BoardVerse", version: APP_VERSION, durableObjectBinding: !!env.ROOMS });
    }
    if (!env.ROOMS) return fail("Cloudflare 尚未設定 Durable Object binding：ROOMS → GameRoom。", 500, "missing_binding");

    if (request.method === "GET" && url.pathname === "/api/games") return json({ ok: true, games: Object.values(GAME_CATALOG) });
    if (request.method === "GET" && url.pathname === "/api/rooms") {
      return roomStub(env, LOBBY_NAME).fetch(new Request("https://boardverse.internal/lobby/list"));
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      try {
        const body = await parseJsonRequest(request);
        const gameId = String(body.gameId || "");
        if (!GAME_CATALOG[gameId]) return fail("未知遊戲。", 400, "unknown_game");
        const playerName = cleanPlayerName(body.playerName);
        const roomName = cleanText(body.roomName, GAME_CATALOG[gameId].title + " 房間");
        const roomId = randomRoomCode();
        const stub = roomStub(env, roomId);
        const created = await stub.fetch(new Request("https://boardverse.internal/init", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomId, roomName, playerName, gameId, isPrivate: !!body.privateRoom,
            rules: normalizeRules(gameId, body.rules), returnPassword: String(body.returnPassword || ""),
            settings: defaultRoomSettings(body.settings || {}),
          }),
        }));
        const data = await created.json();
        if (!created.ok) return json(data, created.status);
        await roomStub(env, LOBBY_NAME).fetch(new Request("https://boardverse.internal/lobby/register", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data.lobby),
        }));
        return json(data, 201);
      } catch (error) {
        return fail(error?.message || "建立房間失敗。", 400);
      }
    }

    const infoMatch = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/info$/);
    if (request.method === "GET" && infoMatch) {
      return roomStub(env, infoMatch[1]).fetch(new Request("https://boardverse.internal/info"));
    }

    const enterMatch = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(?:enter|join)$/);
    if (request.method === "POST" && enterMatch) {
      try {
        const body = await parseJsonRequest(request);
        const role = url.pathname.endsWith("/join") ? "player" : (body.role === "spectator" ? "spectator" : "player");
        const target = new Request("https://boardverse.internal/enter", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playerName: cleanPlayerName(body.playerName), returnPassword: String(body.returnPassword || ""),
            role, sessionToken: String(body.sessionToken || ""),
          }),
        });
        return roomStub(env, enterMatch[1]).fetch(target);
      } catch (error) {
        return fail(error?.message || "進入房間失敗。", 400);
      }
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Z2-9]{6})$/);
    if (request.method === "GET" && wsMatch) {
      if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return fail("此端點需要 WebSocket Upgrade。", 426, "upgrade_required");
      const target = new URL("https://boardverse.internal/ws");
      target.searchParams.set("token", url.searchParams.get("token") || "");
      return roomStub(env, wsMatch[1]).fetch(new Request(target, request));
    }

    return fail("找不到路由。", 404, "not_found");
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.room = undefined;
    this.loadPromise = null;
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async loadRoom() {
    if (this.room !== undefined) return this.room;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const value = await this.ctx.storage.get("room");
        if (!value) { this.room = null; return null; }
        const migrated = migrateRoomState(value);
        this.room = migrated.room;
        if (migrated.changed) await this.ctx.storage.put("room", this.room);
        return this.room;
      })();
    }
    return this.loadPromise;
  }

  clearOfflineForfeit(member) {
    if (!member) return;
    member.offlineSince = null;
    member.offlineDeadline = null;
    member.offlineMatchSeq = null;
  }

  reconcileOfflineForfeits(now = Date.now()) {
    const room = this.room;
    if (!room?.members) return;
    const activeMatchSeq = Number(room.matchSeq) || 0;
    const seated = new Set(Array.isArray(room.seats) ? room.seats.filter(Boolean) : []);
    for (const member of room.members) {
      const eligible = room.status === "playing" && member.role === "player" && seated.has(member.id);
      if (!eligible || member.connected) {
        this.clearOfflineForfeit(member);
        continue;
      }
      if (member.offlineMatchSeq !== activeMatchSeq || !Number.isFinite(member.offlineDeadline)) {
        member.offlineSince = now;
        member.offlineDeadline = now + OFFLINE_FORFEIT_MS;
        member.offlineMatchSeq = activeMatchSeq;
      }
    }
  }

  async updateOfflineAlarm() {
    const room = this.room;
    const deadlines = room?.status === "playing"
      ? room.seats.map((id) => roomMemberById(room, id)).filter((m) => m && !m.connected && Number.isFinite(m.offlineDeadline) && m.offlineMatchSeq === room.matchSeq).map((m) => m.offlineDeadline)
      : [];
    const next = deadlines.length ? Math.min(...deadlines) : null;
    const current = await this.ctx.storage.getAlarm();
    if (next == null) {
      if (current != null) await this.ctx.storage.deleteAlarm();
    } else if (current == null || Math.abs(current - next) > 250) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  async saveRoom() {
    if (!this.room) return;
    this.reconcileOfflineForfeits();
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put("room", this.room);
    await this.updateOfflineAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/lobby/list") return this.lobbyList();
    if (url.pathname === "/lobby/register" && request.method === "POST") return this.lobbyRegister(request);
    if (url.pathname === "/lobby/update" && request.method === "POST") return this.lobbyUpdate(request);
    if (url.pathname === "/init" && request.method === "POST") return this.initRoom(request);
    if (url.pathname === "/info" && request.method === "GET") return this.roomInfo();
    if (url.pathname === "/enter" && request.method === "POST") return this.enterRoom(request);
    if (url.pathname === "/ws") return this.acceptSocket(request, url);
    return fail("Durable Object 路由不存在。", 404);
  }

  async lobbyList() {
    const items = (await this.ctx.storage.get("lobbyRooms")) || {};
    const now = Date.now();
    const keep = {};
    for (const [id, raw] of Object.entries(items)) {
      const r = sanitizeLobbyRecord(raw);
      const fresh = now - (r.updatedAt || r.createdAt || 0) < 24 * 60 * 60 * 1000;
      if (!r.privateRoom && fresh && (r.status === "waiting" || r.status === "playing")) keep[id] = r;
    }
    if (Object.keys(keep).length !== Object.keys(items).length) await this.ctx.storage.put("lobbyRooms", keep);
    const visible = Object.values(keep).sort((a, b) => {
      const priority = (r) => r.status === "playing" ? 0 : 1;
      return priority(a) - priority(b) || (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    }).slice(0, 100);
    return json({ ok: true, rooms: visible });
  }

  async lobbyRegister(request) {
    const body = sanitizeLobbyRecord(await request.json());
    const items = (await this.ctx.storage.get("lobbyRooms")) || {};
    if (body.privateRoom || body.status === "finished") delete items[body.id];
    else items[body.id] = body;
    await this.ctx.storage.put("lobbyRooms", items);
    return json({ ok: true });
  }

  async lobbyUpdate(request) {
    const body = await request.json();
    const items = (await this.ctx.storage.get("lobbyRooms")) || {};
    if (body?.id) {
      const merged = sanitizeLobbyRecord({ ...(items[body.id] || {}), ...body });
      if (merged.privateRoom || merged.status === "finished") delete items[merged.id];
      else items[merged.id] = merged;
    }
    await this.ctx.storage.put("lobbyRooms", items);
    return json({ ok: true });
  }

  async initRoom(request) {
    if (await this.loadRoom()) return fail("房間已存在。", 409, "room_exists");
    const body = await request.json();
    if (!ROOM_CODE_RE.test(body.roomId || "")) return fail("房間代碼格式錯誤。", 400);
    if (!GAME_CATALOG[body.gameId]) return fail("未知遊戲。", 400);
    const name = cleanPlayerName(body.playerName);
    const credentials = await makePasswordRecord(body.returnPassword || "");
    const owner = newMemberBase(name, credentials, { role: "player", side: sideFor(body.gameId, 0), isOwner: true });
    const now = Date.now();
    const rules = normalizeRules(body.gameId, body.rules);
    this.room = {
      schemaVersion: 2,
      id: body.roomId,
      name: cleanText(body.roomName, GAME_CATALOG[body.gameId].title + " 房間"),
      gameId: body.gameId,
      privateRoom: !!body.isPrivate,
      rules,
      settings: defaultRoomSettings(body.settings || {}),
      createdAt: now,
      updatedAt: now,
      status: "waiting",
      ownerId: owner.id,
      members: [owner],
      seats: [owner.id, null],
      pending: [],
      queue: [],
      rematchVotes: [],
      game: newGame(body.gameId, rules),
      result: null,
      matchSeq: 1,
      playerChat: [],
      spectatorChat: [],
      chatSeq: 0,
      replays: [],
      currentReplay: null,
    };
    await this.saveRoom();
    return json({ ok: true, roomId: this.room.id, token: owner.token, role: "host", memberId: owner.id, lobby: this.lobbyRecord() }, 201);
  }

  async roomInfo() {
    const room = await this.loadRoom();
    if (!room) return fail("找不到此房間。", 404, "room_not_found");
    const playerCount = room.seats.filter(Boolean).length;
    return json({ ok: true, room: {
      id: room.id, name: room.name, gameId: room.gameId, gameTitle: GAME_CATALOG[room.gameId]?.title || room.gameId,
      privateRoom: !!room.privateRoom, status: room.status, playerCount, capacity: 2,
      queueEnabled: !!room.settings.queueEnabled, queueLength: room.queue.length,
      playerAction: playerCount < 2 ? (room.privateRoom ? "request" : "join") : (room.settings.queueEnabled ? "queue" : "disabled"),
      spectatorAllowed: true, rulesSummary: rulesSummary(room.gameId, room.rules || normalizeRules(room.gameId, {})), updatedAt: room.updatedAt,
    }});
  }

  async enterRoom(request) {
    const room = await this.loadRoom();
    if (!room) return fail("找不到此房間。", 404, "room_not_found");
    const body = await request.json();
    const playerName = cleanPlayerName(body.playerName);
    const nameKey = normalizeNameKey(playerName);
    const password = String(body.returnPassword || "");
    const desiredRole = body.role === "spectator" ? "spectator" : "player";
    const sessionToken = String(body.sessionToken || "");
    const existing = room.members.find((m) => m.nameKey === nameKey);
    if (existing) {
      let allowed = sessionToken && sessionToken === existing.token;
      if (!allowed && existing.passwordHash) allowed = await verifyPasswordRecord(existing, password);
      if (!allowed) return fail(existing.passwordHash ? "此名稱已存在；請輸入正確回場密碼。" : "此房間已有相同名稱，且該名稱未設定可回場密碼。", 409, "name_taken");
      if (sessionToken !== existing.token) {
        const oldToken = existing.token;
        existing.token = crypto.randomUUID();
        existing.connected = false;
        existing.updatedAt = Date.now();
        this.endTokenSession(oldToken, "此身份已在另一個工作階段回場。");
      }
      await this.saveRoom();
      await this.broadcastState();
      return json({ ok: true, roomId: room.id, token: existing.token, role: this.clientRole(existing), memberId: existing.id, returned: true });
    }

    const credentials = await makePasswordRecord(password);
    const member = newMemberBase(playerName, credentials, { role: desiredRole === "spectator" ? "spectator" : "pending" });
    room.members.push(member);

    if (desiredRole === "spectator") {
      member.role = "spectator";
    } else {
      const openSeat = room.seats.findIndex((id) => !id);
      if (openSeat >= 0) {
        if (room.privateRoom) {
          member.role = "pending";
          room.pending.push(member.id);
        } else {
          this.assignSeat(member, openSeat);
          this.maybeStartMatch();
        }
      } else if (room.settings.queueEnabled) {
        member.role = "queued";
        room.queue.push(member.id);
      } else {
        room.members = room.members.filter((m) => m.id !== member.id);
        return fail("玩家席位已滿，且房間未開啟排隊。你仍可選擇觀戰。", 409, "room_full");
      }
    }

    await this.saveRoom();
    await this.syncLobby();
    await this.broadcastState();
    return json({ ok: true, roomId: room.id, token: member.token, role: this.clientRole(member), memberId: member.id, pending: member.role === "pending", queued: member.role === "queued" });
  }

  clientRole(member) {
    if (!member) return "unknown";
    if (member.role === "player") return member.isOwner ? "host" : "guest";
    if (member.role === "pending") return "pending";
    if (member.role === "queued") return "queued";
    return "spectator";
  }

  authToken(token) {
    const member = roomMemberByToken(this.room, token);
    return member ? { member, role: this.clientRole(member), isOwner: member.id === this.room.ownerId } : null;
  }

  assignSeat(member, seatIndex) {
    const room = this.room;
    room.seats[seatIndex] = member.id;
    member.role = "player";
    member.side = sideFor(room.gameId, seatIndex);
    member.updatedAt = Date.now();
    room.pending = room.pending.filter((id) => id !== member.id);
    room.queue = room.queue.filter((id) => id !== member.id);
  }

  moveToSpectator(member) {
    if (!member) return;
    const idx = this.room.seats.indexOf(member.id);
    if (idx >= 0) this.room.seats[idx] = null;
    member.role = "spectator";
    member.side = null;
    member.updatedAt = Date.now();
  }

  startReplay() {
    const room = this.room;
    const players = room.seats.map((id) => roomMemberById(room, id)).filter(Boolean).map((m) => ({ memberId:m.id, name:m.name, side:m.side }));
    room.currentReplay = {
      id: String(room.matchSeq), matchSeq: room.matchSeq, gameId: room.gameId,
      rules: structuredClone(room.rules || normalizeRules(room.gameId, {})),
      startedAt: Date.now(), players, initialGame: publicGameState(room.game), actions: [], partial: false,
    };
  }

  recordReplayAction(member, msg, kind = "move") {
    const replay = this.room?.currentReplay;
    if (!replay) return;
    if (replay.actions.length >= MAX_REPLAY_ACTIONS) { replay.partial = true; return; }
    replay.actions.push({
      index: replay.actions.length + 1,
      kind,
      side: member?.side || null,
      memberId: member?.id || null,
      name: member?.name || null,
      at: Date.now(),
      move: kind === "move" ? sanitizeReplayMove(msg) : null,
    });
  }

  archiveReplay(result) {
    const room = this.room;
    if (!room?.currentReplay) return;
    const replay = room.currentReplay;
    replay.endedAt = Date.now();
    replay.result = structuredClone(result || null);
    room.replays.push(replay);
    if (room.replays.length > MAX_REPLAY_HISTORY) room.replays = room.replays.slice(-MAX_REPLAY_HISTORY);
    room.currentReplay = null;
  }

  maybeStartMatch() {
    const room = this.room;
    if (room.seats[0] && room.seats[1]) {
      const a = seatMember(room, 0), b = seatMember(room, 1);
      if (a) { a.role = "player"; a.side = sideFor(room.gameId, 0); }
      if (b) { b.role = "player"; b.side = sideFor(room.gameId, 1); }
      room.game = newGame(room.gameId, room.rules);
      room.status = "playing";
      room.result = null;
      room.rematchVotes = [];
      room.matchSeq = (Number(room.matchSeq) || 0) + 1;
      this.startReplay();
      return true;
    }
    if (room.status !== "finished") room.status = "waiting";
    return false;
  }

  async acceptSocket(request, url) {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return fail("需要 WebSocket Upgrade。", 426);
    const room = await this.loadRoom();
    if (!room) return fail("找不到房間。", 404);
    const token = url.searchParams.get("token") || "";
    const auth = this.authToken(token);
    if (!auth) return fail("無效或已失效的房間憑證。", 401, "invalid_token");
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ token });
    auth.member.connected = true;
    this.clearOfflineForfeit(auth.member);
    auth.member.updatedAt = Date.now();
    await this.saveRoom();
    await this.syncLobby();
    this.sendState(server);
    await this.broadcastState();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_WS_MESSAGE) { this.send(ws, { type: "error", message: "訊息格式或大小不合法。" }); return; }
    await this.loadRoom();
    if (!this.room) return;
    const token = (ws.deserializeAttachment() || {}).token || "";
    let msg;
    try { msg = JSON.parse(message); } catch { this.send(ws, { type: "error", message: "JSON 格式錯誤。" }); return; }
    const auth = this.authToken(token);
    if (!auth) { this.send(ws, { type: "error", message: "工作階段已失效。" }); return; }
    try {
      if (msg.type === "move") await this.handleMove(token, msg);
      else if (msg.type === "pass") await this.handleMove(token, { type: "move", action: "pass" });
      else if (msg.type === "swap_sides") await this.swapSides(token);
      else if (msg.type === "chat") await this.handleChat(token, msg.text);
      else if (msg.type === "review_join") await this.reviewJoin(token, msg.requestId, !!msg.approve);
      else if (msg.type === "queue_move") await this.queueMove(token, msg.memberId, msg.direction);
      else if (msg.type === "queue_settings") await this.queueSettings(token, msg);
      else if (msg.type === "resign") await this.resign(token);
      else if (msg.type === "rematch") await this.voteRematch(token);
      else if (msg.type === "replay_get") await this.sendReplay(ws, token, msg.replayId);
      else if (msg.type === "state") this.sendState(ws);
      else if (msg.type !== "ping") throw new Error("未知操作。");
    } catch (error) { this.send(ws, { type: "error", message: error?.message || "操作失敗。" }); }
  }

  async swapSides(token) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || room.status !== "playing" || room.gameId !== "gomoku") throw new Error("目前不能交換持色。");
    if (!auth || auth.member.role !== "player" || room.seats[1] !== auth.member.id) throw new Error("只有玩家 B 可以在 Swap 時機選擇交換持色。");
    if (room.game.rules?.opening !== "swap" || !room.game.swapAvailable || room.game.moveNumber !== 1) throw new Error("目前不是 Swap 交換時機。");
    const a = seatMember(room, 0), b = seatMember(room, 1);
    const tmp = a.side; a.side = b.side; b.side = tmp; room.game.swapAvailable = false;
    this.recordReplayAction(auth.member, null, "swap");
    await this.saveRoom(); await this.broadcastState();
  }

  async handleChat(token, text) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || !auth || auth.member.role === "pending") throw new Error("加入申請核准後才能使用聊天室。");
    const clean = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_CHAT_TEXT);
    if (!clean) throw new Error("聊天訊息不能是空白。");
    const channel = auth.member.role === "player" ? "playerChat" : "spectatorChat";
    room.chatSeq = (Number(room.chatSeq) || 0) + 1;
    const entry = { id: room.chatSeq, memberId: auth.member.id, name: auth.member.name, role: auth.member.role, side: auth.member.side || null, text: clean, at: Date.now() };
    room[channel].push(entry);
    if (room[channel].length > MAX_CHAT_HISTORY) room[channel] = room[channel].slice(-MAX_CHAT_HISTORY);
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async handleMove(token, msg) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || room.status !== "playing") throw new Error("棋局尚未開始或已結束。");
    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");
    const result = applyGameAction(room.game, auth.member.side, msg);
    this.recordReplayAction(auth.member, msg, "move");
    room.game = result.game;
    room.rematchVotes = [];
    if (result.ended) await this.finishMatch(result.result);
    else {
      await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
    }
  }

  async reviewJoin(token, requestId, approve) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || !auth?.isOwner) throw new Error("只有房主可以審核加入申請。");
    const member = roomMemberById(room, requestId);
    if (!member || member.role !== "pending" || !room.pending.includes(member.id)) throw new Error("找不到此加入申請。");
    room.pending = room.pending.filter((id) => id !== member.id);
    if (!approve) {
      const oldToken = member.token;
      room.members = room.members.filter((m) => m.id !== member.id);
      this.endTokenSession(oldToken, "房主已拒絕你的加入申請。");
    } else {
      const openSeat = room.seats.findIndex((id) => !id);
      if (openSeat >= 0) { this.assignSeat(member, openSeat); this.maybeStartMatch(); }
      else if (room.settings.queueEnabled) { member.role = "queued"; member.side = null; room.queue.push(member.id); }
      else {
        const oldToken = member.token;
        room.members = room.members.filter((m) => m.id !== member.id);
        this.endTokenSession(oldToken, "房間玩家席位已滿，且未開啟排隊。");
      }
    }
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async queueMove(token, memberId, direction) {
    const auth = this.authToken(token);
    if (!auth?.isOwner) throw new Error("只有房主可以調整排隊順序。");
    const room = this.room;
    const i = room.queue.indexOf(String(memberId || ""));
    if (i < 0) throw new Error("找不到此排隊成員。");
    const delta = direction === "down" ? 1 : -1;
    const j = i + delta;
    if (j < 0 || j >= room.queue.length) return;
    [room.queue[i], room.queue[j]] = [room.queue[j], room.queue[i]];
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async queueSettings(token, msg) {
    const auth = this.authToken(token);
    if (!auth?.isOwner) throw new Error("只有房主可以設定排隊模式。");
    const room = this.room;
    if (typeof msg.enabled === "boolean") room.settings.queueEnabled = msg.enabled;
    if (["winner_stays", "rotate_both", "host_stays"].includes(msg.rotationPolicy)) room.settings.rotationPolicy = msg.rotationPolicy;
    if (!room.settings.queueEnabled && room.queue.length) {
      for (const id of room.queue.splice(0)) {
        const member = roomMemberById(room, id);
        if (member) { member.role = "spectator"; member.side = null; }
      }
    }
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async resign(token) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || room.status !== "playing") throw new Error("目前沒有進行中的棋局。");
    if (!auth || auth.member.role !== "player" || !room.seats.includes(auth.member.id)) throw new Error("你目前沒有玩家席位。");
    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== auth.member.id);
    await this.finishMatch({ winner: opponent?.side || null, reason: auth.member.name + " 認輸" });
  }

  async finishMatch(result) {
    const room = this.room;
    if (!room || room.status !== "playing") return;
    const publicResult = this.publicResult(result);
    if (room.game) { room.game.ended = true; if ("winner" in room.game) room.game.winner = publicResult.winner; }
    const loser = publicResult.winner ? room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.side !== publicResult.winner) : null;
    room.status = "finished";
    room.result = { ...result, ...publicResult, loserMemberId: result?.loserMemberId || loser?.id || null, loserName: result?.loserName || loser?.name || null };
    this.archiveReplay(room.result);
    for (const member of room.members) this.clearOfflineForfeit(member);
    this.broadcastEvent({ type: "match_end", result: room.result });
    if (room.settings.queueEnabled) this.rotateAfterMatch(room.result);
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  publicResult(result) {
    const winner = result?.winner || null;
    const winnerMember = winner ? this.room.seats.map((id) => roomMemberById(this.room, id)).find((m) => m?.side === winner) : null;
    return { winner, winnerMemberId: result?.winnerMemberId || winnerMember?.id || null, winnerName: result?.winnerName || winnerMember?.name || null, loserMemberId: result?.loserMemberId || null, loserName: result?.loserName || null, reason: cleanText(result?.reason, "棋局結束") };
  }

  rotateAfterMatch(result) {
    const room = this.room;
    const seated = room.seats.map((id) => roomMemberById(room, id));
    const winner = result?.winner ? seated.find((m) => m?.side === result.winner) : null;
    const hostStays = room.settings.rotationPolicy === "host_stays";
    const rotateBoth = !hostStays && (room.settings.rotationPolicy === "rotate_both" || !winner);
    for (const member of seated) {
      if (!member) continue;
      if (hostStays ? !member.isOwner : (rotateBoth || member.id !== winner.id)) this.moveToSpectator(member);
    }
    while (room.queue.length && room.seats.some((id) => !id)) {
      const id = room.queue.shift();
      const member = roomMemberById(room, id);
      if (!member || member.role !== "queued") continue;
      const seatIndex = room.seats.findIndex((seat) => !seat);
      this.assignSeat(member, seatIndex);
      this.sendToToken(member.token, { type: "queue_turn", roomId: room.id, roomName: room.name, side: member.side });
    }
    if (!this.maybeStartMatch()) {
      room.status = "waiting";
      room.game = newGame(room.gameId, room.rules);
      room.rematchVotes = [];
    }
  }

  async voteRematch(token) {
    const room = this.room;
    if (!room || room.settings.queueEnabled) throw new Error("排隊模式會自動輪替，不使用再戰投票。");
    if (room.status !== "finished" || !room.seats[0] || !room.seats[1]) throw new Error("目前無法重新對局。");
    const auth = this.authToken(token);
    if (!auth || auth.member.role !== "player") throw new Error("你目前沒有玩家席位。");
    if (!room.rematchVotes.includes(auth.member.id)) room.rematchVotes.push(auth.member.id);
    if (room.seats.every((id) => room.rematchVotes.includes(id))) this.maybeStartMatch();
    await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
  }

  async webSocketClose(ws, code, reason) {
    await this.loadRoom();
    const token = (ws.deserializeAttachment() || {}).token || "";
    if (token && !this.hasSocketForToken(token, ws)) {
      const member = roomMemberByToken(this.room, token);
      if (member) member.connected = false;
      await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
    }
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws) {
    await this.loadRoom();
    const token = (ws.deserializeAttachment() || {}).token || "";
    if (token && !this.hasSocketForToken(token, ws)) {
      const member = roomMemberByToken(this.room, token);
      if (member) member.connected = false;
      await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
    }
  }

  async alarm() {
    const room = await this.loadRoom();
    if (!room) {
      if (await this.ctx.storage.getAlarm() != null) await this.ctx.storage.deleteAlarm();
      return;
    }
    this.reconcileOfflineForfeits();
    if (room.status !== "playing") { await this.saveRoom(); return; }
    const now = Date.now();
    const overdue = room.seats
      .map((id) => roomMemberById(room, id))
      .filter((m) => m && m.role === "player" && !m.connected && Number.isFinite(m.offlineDeadline) && m.offlineMatchSeq === room.matchSeq && m.offlineDeadline <= now)
      .sort((a, b) => a.offlineDeadline - b.offlineDeadline);
    if (!overdue.length) { await this.saveRoom(); return; }
    const loser = overdue[0];
    if (this.hasSocketForToken(loser.token)) {
      loser.connected = true;
      this.clearOfflineForfeit(loser);
      await this.saveRoom(); await this.syncLobby(); await this.broadcastState();
      return;
    }
    const opponent = room.seats.map((id) => roomMemberById(room, id)).find((m) => m && m.id !== loser.id);
    await this.finishMatch({ winner: opponent?.side || null, winnerMemberId: opponent?.id || null, winnerName: opponent?.name || null, loserMemberId: loser.id, loserName: loser.name, reason: loser.name + " 離線超過 60 秒，自動認輸" });
  }

  async sendReplay(ws, token, replayId) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || !auth || auth.member.role === "pending") throw new Error("目前無法查看回放。");
    const id = String(replayId || "");
    const replay = room.replays.find((x) => String(x.id) === id);
    if (!replay) throw new Error("找不到此對局回放。");
    const built = buildReplay(replay);
    this.send(ws, { type:"replay_data", replay:built });
  }

  hasSocketForToken(token, except = null) {
    return this.ctx.getWebSockets().some((socket) => socket !== except && (socket.deserializeAttachment() || {}).token === token);
  }

  endTokenSession(token, message) {
    for (const socket of this.ctx.getWebSockets()) {
      if ((socket.deserializeAttachment() || {}).token !== token) continue;
      this.send(socket, { type: "session_end", message });
      try { socket.close(4001, "session replaced"); } catch {}
    }
  }

  sendToToken(token, payload) {
    for (const socket of this.ctx.getWebSockets()) if ((socket.deserializeAttachment() || {}).token === token) this.send(socket, payload);
  }

  broadcastEvent(payload) {
    for (const socket of this.ctx.getWebSockets()) this.send(socket, payload);
  }

  send(ws, payload) { try { ws.send(JSON.stringify(payload)); } catch {} }

  sendState(ws) {
    const token = (ws.deserializeAttachment() || {}).token || "";
    this.send(ws, { type: "state", room: roomView(this.room, token) });
  }

  async broadcastState() { for (const ws of this.ctx.getWebSockets()) this.sendState(ws); }

  lobbyRecord() {
    const r = this.room;
    return sanitizeLobbyRecord({
      id: r.id, name: r.name, gameId: r.gameId, gameTitle: GAME_CATALOG[r.gameId]?.title || r.gameId,
      rulesSummary: rulesSummary(r.gameId, r.rules || normalizeRules(r.gameId, {})), privateRoom: r.privateRoom,
      status: r.status, players: r.seats.filter(Boolean).length, capacity: 2, queueEnabled: !!r.settings.queueEnabled,
      queueLength: r.queue.length, createdAt: r.createdAt, updatedAt: r.updatedAt,
    });
  }

  async syncLobby() {
    if (!this.room || !this.env.ROOMS) return;
    try {
      await this.env.ROOMS.getByName(LOBBY_NAME).fetch(new Request("https://boardverse.internal/lobby/update", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(this.lobbyRecord()),
      }));
    } catch {}
  }
}

function sanitizeLobbyRecord(r) {
  return {
    id: String(r.id || ""), name: cleanText(r.name, "棋局"), gameId: String(r.gameId || ""),
    gameTitle: cleanText(r.gameTitle, GAME_CATALOG[r.gameId]?.title || "棋局"), rulesSummary: String(r.rulesSummary || "").slice(0, 220),
    privateRoom: !!r.privateRoom, status: ["waiting", "playing", "finished"].includes(r.status) ? r.status : "waiting",
    players: Math.max(0, Math.min(2, Number(r.players) || 0)), capacity: 2,
    queueEnabled: !!r.queueEnabled, queueLength: Math.max(0, Number(r.queueLength) || 0),
    createdAt: Number(r.createdAt) || Date.now(), updatedAt: Number(r.updatedAt) || Date.now(),
  };
}

function roomView(room, token) {
  if (!room) return null;
  const member = roomMemberByToken(room, token);
  const role = member ? (member.role === "player" ? (member.isOwner ? "host" : "guest") : member.role) : "unknown";
  const playerA = seatMember(room, 0), playerB = seatMember(room, 1);
  const isOwner = !!member && member.id === room.ownerId;
  const chat = member?.role === "player" ? room.playerChat : (["spectator", "queued"].includes(member?.role) ? room.spectatorChat : []);
  return {
    id: room.id, name: room.name, gameId: room.gameId, game: GAME_CATALOG[room.gameId],
    rules: structuredClone(room.rules || normalizeRules(room.gameId, {})), rulesSummary: rulesSummary(room.gameId, room.rules || normalizeRules(room.gameId, {})),
    ruleDefs: publicRuleDefs(room.gameId), privateRoom: room.privateRoom, status: room.status, role, rawRole: member?.role || "unknown",
    isHost: isOwner, myMemberId: member?.id || null, mySide: member?.side || null,
    players: { host: publicMember(playerA), guest: publicMember(playerB) },
    pending: isOwner ? room.pending.map((id) => publicMember(roomMemberById(room, id))).filter(Boolean) : [],
    queue: room.queue.map((id, index) => ({ ...publicMember(roomMemberById(room, id)), position: index + 1 })).filter((x) => x.id),
    spectatorCount: room.members.filter((m) => m.role === "spectator").length,
    queueSettings: { ...room.settings },
    gameState: publicGameState(room.game), result: room.result, resultSummary: resultSummary(room, token),
    chat: Array.isArray(chat) ? chat.slice(-MAX_CHAT_HISTORY).map((m) => ({ id: m.id, memberId: m.memberId, name: m.name, role: m.role, side: m.side, text: m.text, at: m.at })) : [],
    chatChannel: member?.role === "player" ? "players" : (["spectator", "queued"].includes(member?.role) ? "spectators" : "none"),
    rematchVotes: member?.role === "player" ? room.rematchVotes.length : 0,
    canSwap: member?.role === "player" && room.seats[1] === member.id && room.gameId === "gomoku" && !!room.game?.swapAvailable,
    replays: member && member.role !== "pending" ? room.replays.slice(-MAX_REPLAY_HISTORY).reverse().map(replaySummary) : [],
  };
}

function resultSummary(room, token) {
  if (!room?.result) return null;
  const result = room.result;
  const winnerSide = result.winner || null;
  const mine = roomMemberByToken(room, token);
  const winnerName = result.winnerName || (winnerSide ? room.members.find((m) => m.id === result.winnerMemberId)?.name : null) || null;
  const loserName = result.loserName || (result.loserMemberId ? room.members.find((m) => m.id === result.loserMemberId)?.name : null) || null;
  let outcome = "draw";
  if (winnerSide) {
    if (mine?.id && result.winnerMemberId) outcome = mine.id === result.winnerMemberId ? "win" : (mine.id === result.loserMemberId ? "loss" : "finished");
    else if (mine?.role === "player") outcome = mine.side === winnerSide ? "win" : "loss";
    else outcome = "finished";
  }
  return { outcome, winnerSide, winnerName, loserName, reason: cleanText(result.reason, "棋局結束") };
}


function sanitizeReplayMove(msg) {
  const out = {};
  if (msg?.action === "pass") out.action = "pass";
  for (const key of ["r","c","from","to"]) if (Number.isInteger(Number(msg?.[key]))) out[key] = Number(msg[key]);
  if (msg?.promotion) out.promotion = String(msg.promotion).slice(0, 1).toUpperCase();
  return out;
}

function replaySummary(replay) {
  return {
    id:String(replay?.id || ""), matchSeq:Number(replay?.matchSeq)||0, gameId:String(replay?.gameId||""),
    startedAt:Number(replay?.startedAt)||0, endedAt:Number(replay?.endedAt)||0,
    players:Array.isArray(replay?.players)?replay.players.map((p)=>({name:cleanText(p?.name,"Player"),side:p?.side||null})):[],
    result:replay?.result ? { winner:replay.result.winner||null, winnerName:replay.result.winnerName||null, loserName:replay.result.loserName||null, reason:cleanText(replay.result.reason,"棋局結束") } : null,
    actionCount:Array.isArray(replay?.actions)?replay.actions.length:0, partial:!!replay?.partial,
  };
}

function buildReplay(replay) {
  let game = structuredClone(replay?.initialGame || newGame(replay?.gameId, replay?.rules || {}));
  const frames = [{ index:0, label:"開始", at:replay?.startedAt||0, game:publicGameState(game) }];
  let error = null;
  for (const action of Array.isArray(replay?.actions) ? replay.actions : []) {
    try {
      if (action.kind === "swap") {
        if (game && "swapAvailable" in game) game.swapAvailable = false;
      } else {
        const applied = applyGameAction(game, action.side, action.move || {});
        game = applied.game;
      }
      frames.push({ index:frames.length, label:action.kind === "swap" ? "Swap" : (action.move?.action === "pass" ? "Pass" : (action.name || action.side || "Move")), at:action.at||0, game:publicGameState(game) });
    } catch (e) {
      error = e?.message || "Replay reconstruction failed";
      break;
    }
  }
  return { ...replaySummary(replay), rules:structuredClone(replay?.rules||{}), frames, error };
}

function sideFor(gameId, seat) {
  if (gameId === "chess") return seat === 0 ? "W" : "B";
  if (gameId === "xiangqi") return seat === 0 ? "R" : "B";
  return seat === 0 ? "B" : "W";
}

function newGame(gameId, rulesInput = {}) {
  const rules = normalizeRules(gameId, rulesInput);
  if (gameId === "go9" || gameId === "go13" || gameId === "go19") {
    const size = Number(gameId.slice(2));
    const board = Array(size * size).fill(null);
    const handicapPoints = goHandicapPoints(size, rules.handicap);
    for (const [r,c] of handicapPoints) board[rcToIndex(r,c,size)] = "B";
    const firstTurn = handicapPoints.length >= 2 ? "W" : "B";
    const initialHash = boardHash(board);
    return { type:"go", size, board, turn:firstTurn, moveNumber:0, previousPositionHash:null, positionHistory:[initialHash], consecutivePasses:0, captures:{B:0,W:0}, komi:rules.komi, rules, ended:false, score:null, lastMove:null };
  }
  if (gameId === "gomoku") {
    const size = rules.boardSize;
    return { type:"gomoku", size, board:Array(size*size).fill(null), turn:"B", moveNumber:0, ended:false, winner:null, lastMove:null, rules, stonesThisTurn: rules.variant === "connect6" ? 1 : 1, swapAvailable:false };
  }
  if (gameId === "renju") {
    const size = 15;
    return { type:"renju", size, board:Array(size*size).fill(null), turn:"B", moveNumber:0, ended:false, winner:null, lastMove:null, rules, swapAvailable:false };
  }
  if (gameId === "xiangqi") return newXiangqi(rules);
  if (gameId === "chess") return newChess(rules);
  if (gameId === "reversi") return newReversi(rules);
  throw new Error("未知遊戲。");
}

function goHandicapPoints(size, handicap) {
  const h = Math.max(0, Math.min(9, Number(handicap)||0));
  if (h < 2 || ![9,13,19].includes(size)) return [];
  const low = size === 9 ? 2 : 3, high = size - 1 - low, mid = Math.floor(size/2);
  const seq = [[low,high],[high,low],[high,high],[low,low],[mid,mid],[mid,low],[mid,high],[low,mid],[high,mid]];
  const order = h === 5 ? [0,1,2,3,4] : h === 6 ? [0,1,2,3,5,6] : h === 7 ? [0,1,2,3,5,6,4] : h === 8 ? [0,1,2,3,5,6,7,8] : h === 9 ? [0,1,2,3,5,6,7,8,4] : Array.from({length:h},(_,i)=>i);
  return order.map((i)=>seq[i]);
}

function publicGameState(game) {
  const out = structuredClone(game);
  if (out?.type === "go" && !out.ended) {
    const rules = out.rules || {};
    if (rules.mode === "capture") out.liveEstimate = { kind:"capture", B:out.captures?.B || 0, W:out.captures?.W || 0, goal:rules.captureGoal || 1 };
    else { const score = scoreGo(out); out.liveEstimate = { kind:"score", B:score.B, W:score.W, scoring:rules.scoring || "area" }; }
  }
  return out;
}

function applyGameAction(game, side, msg) {
  if (game.type === "go") return applyGo(game, side, msg);
  if (game.type === "gomoku" || game.type === "renju") return applyGomoku(game, side, msg);
  if (game.type === "xiangqi") return applyXiangqi(game, side, msg);
  if (game.type === "chess") return applyChess(game, side, msg);
  if (game.type === "reversi") return applyReversi(game, side, msg);
  throw new Error("未知棋類。");
}

function rcToIndex(r, c, size) { return r * size + c; }
function inBoard(r, c, rows, cols = rows) { return r >= 0 && c >= 0 && r < rows && c < cols; }
function opponent(side) { return side === "B" ? "W" : "B"; }

// ---------- Go ----------
function applyGo(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const next = structuredClone(game);
  const oldHash = boardHash(game.board);
  const rules = game.rules || normalizeRules("go" + game.size, {});
  if (msg.action === "pass") {
    next.moveNumber++;
    next.consecutivePasses++;
    next.previousPositionHash = oldHash;
    next.lastMove = { pass: true, side };
    next.turn = opponent(side);
    if (next.consecutivePasses >= 2) {
      next.ended = true;
      next.score = scoreGo(next);
      const winner = next.score.B === next.score.W ? null : (next.score.B > next.score.W ? "B" : "W");
      return { game: next, ended: true, result: { winner, reason: "雙方連續虛手，" + (rules.scoring === "territory" ? "地計分" : "面積計分") + " " + next.score.B + " : " + next.score.W } };
    }
    return { game: next, ended: false };
  }
  const r = Number(msg.r), c = Number(msg.c);
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBoard(r, c, next.size)) throw new Error("落子座標不合法。");
  const idx = rcToIndex(r, c, next.size);
  if (next.board[idx]) throw new Error("該交叉點已有棋子。");
  next.board[idx] = side;
  const enemy = opponent(side);
  let captured = 0;
  for (const [nr, nc] of orthNeighbors(r, c, next.size, next.size)) {
    const nidx = rcToIndex(nr, nc, next.size);
    if (next.board[nidx] !== enemy) continue;
    const group = goGroup(next.board, next.size, nr, nc);
    if (group.liberties.size === 0) {
      captured += group.stones.length;
      for (const s of group.stones) next.board[s] = null;
    }
  }
  let ownGroup = goGroup(next.board, next.size, r, c);
  if (ownGroup.liberties.size === 0) {
    if (!rules.suicide) throw new Error("此手為自殺手，目前規則禁止。");
    for (const s of ownGroup.stones) next.board[s] = null;
  }
  const newHash = boardHash(next.board);
  if (rules.koRule === "superko") {
    if ((game.positionHistory || []).includes(newHash)) throw new Error("此手違反盤面超劫（Superko），不能重現先前盤面。");
  } else if (game.previousPositionHash && newHash === game.previousPositionHash) throw new Error("此手造成簡單劫立即重複，不能落子。");
  next.captures[side] += captured;
  next.positionHistory = [...(game.positionHistory || []), newHash].slice(-2000);
  if (rules.mode === "capture" && next.captures[side] >= rules.captureGoal) {
    next.moveNumber++; next.consecutivePasses = 0; next.previousPositionHash = oldHash; next.lastMove = {r,c,side,captured}; next.ended = true;
    return { game: next, ended:true, result:{winner:side, reason:"Capture Go：先提滿 " + rules.captureGoal + " 子"} };
  }
  next.moveNumber++;
  next.consecutivePasses = 0;
  next.previousPositionHash = oldHash;
  next.lastMove = { r, c, side, captured };
  next.turn = enemy;
  return { game: next, ended: false };
}

function orthNeighbors(r, c, rows, cols) {
  const out = [];
  for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nr = r + dr, nc = c + dc;
    if (inBoard(nr, nc, rows, cols)) out.push([nr, nc]);
  }
  return out;
}

function goGroup(board, size, sr, sc) {
  const color = board[rcToIndex(sr, sc, size)];
  const stack = [[sr, sc]];
  const seen = new Set();
  const stones = [];
  const liberties = new Set();
  while (stack.length) {
    const [r, c] = stack.pop();
    const idx = rcToIndex(r, c, size);
    if (seen.has(idx)) continue;
    seen.add(idx);
    stones.push(idx);
    for (const [nr, nc] of orthNeighbors(r, c, size, size)) {
      const nidx = rcToIndex(nr, nc, size);
      if (board[nidx] == null) liberties.add(nidx);
      else if (board[nidx] === color && !seen.has(nidx)) stack.push([nr, nc]);
    }
  }
  return { stones, liberties };
}

function boardHash(board) { return board.map((x) => x || ".").join(""); }

function scoreGo(game) {
  const rules = game.rules || {scoring:"area"};
  let B = rules.scoring === "territory" ? (game.captures?.B || 0) : 0;
  let W = (rules.scoring === "territory" ? (game.captures?.W || 0) : 0) + game.komi;
  const visited = new Set();
  for (let i = 0; i < game.board.length; i++) {
    if (game.board[i] === "B") { if (rules.scoring === "area") B++; continue; }
    if (game.board[i] === "W") { if (rules.scoring === "area") W++; continue; }
    if (visited.has(i)) continue;
    const region = [];
    const borders = new Set();
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      region.push(cur);
      const r = Math.floor(cur / game.size), c = cur % game.size;
      for (const [nr, nc] of orthNeighbors(r, c, game.size, game.size)) {
        const ni = rcToIndex(nr, nc, game.size);
        const v = game.board[ni];
        if (v == null && !visited.has(ni)) stack.push(ni);
        else if (v) borders.add(v);
      }
    }
    if (borders.size === 1) {
      if (borders.has("B")) B += region.length;
      else if (borders.has("W")) W += region.length;
    }
  }
  return { B, W };
}

// ---------- Gomoku / Renju ----------
const LINE_DIRS = [[1,0],[0,1],[1,1],[1,-1]];

function applyGomoku(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const r = Number(msg.r), c = Number(msg.c);
  if (!Number.isInteger(r) || !Number.isInteger(c) || !inBoard(r, c, game.size)) throw new Error("落子座標不合法。");
  const idx = rcToIndex(r, c, game.size);
  if (game.board[idx]) throw new Error("該位置已有棋子。");
  const next = structuredClone(game);
  const rules = next.rules || {};
  const center = Math.floor(game.size / 2);
  if (game.type === "gomoku" && rules.opening === "pro") {
    if (game.moveNumber === 0 && (r !== center || c !== center)) throw new Error("Pro 開局：黑方第一手必須下在中心。");
    if (game.moveNumber === 2 && Math.abs(r-center) <= 2 && Math.abs(c-center) <= 2) throw new Error("Pro 開局：黑方第二顆必須下在中央 5×5 區域之外。");
  }
  next.board[idx] = side;

  if (game.type === "renju" && side === "B") {
    const lengths = LINE_DIRS.map(([dr, dc]) => contiguousLength(next.board, next.size, r, c, dr, dc, side));
    if (lengths.some((n) => n > 5)) throw new Error("連珠黑方禁手：長連（超過五子）。");
    if (lengths.some((n) => n === 5)) {
      next.ended = true; next.winner = side; next.lastMove = { r, c, side }; next.moveNumber++;
      return { game: next, ended: true, result: { winner: side, reason: "黑方精確五連" } };
    }
    const fours = countRenjuFourDirections(next.board, next.size, r, c);
    if (fours >= 2) throw new Error("連珠黑方禁手：雙四。");
    const threes = countRenjuOpenThreeDirections(next.board, next.size, r, c);
    if (threes >= 2) throw new Error("連珠黑方禁手：雙活三（目前採直線威脅近似判定）。");
  }

  const target = game.type === "gomoku" && rules.variant === "connect6" ? 6 : 5;
  const wins = LINE_DIRS.some(([dr, dc]) => {
    const n = contiguousLength(next.board, next.size, r, c, dr, dc, side);
    if (game.type === "renju" && side === "B") return n === 5;
    if (game.type === "gomoku" && rules.variant === "exact5") return n === 5;
    return n >= target;
  });
  next.lastMove = { r, c, side };
  next.moveNumber++;
  if (wins) {
    next.ended = true; next.winner = side;
    return { game: next, ended: true, result: { winner: side, reason: target === 6 ? "形成六連" : (rules.variant === "exact5" ? "形成精確五連" : "形成五連") } };
  }
  if (next.board.every((cell) => cell != null)) {
    next.ended = true; next.winner = null;
    return { game: next, ended: true, result: { winner: null, reason: "棋盤已滿且無勝線，和棋" } };
  }
  if (game.type === "gomoku" && rules.opening === "swap" && game.moveNumber === 0) next.swapAvailable = true;
  if (game.type === "gomoku" && rules.variant === "connect6") {
    if (game.moveNumber === 0) { next.turn = "W"; next.stonesThisTurn = 2; }
    else if ((game.stonesThisTurn || 2) > 1) { next.turn = side; next.stonesThisTurn = (game.stonesThisTurn || 2) - 1; }
    else { next.turn = opponent(side); next.stonesThisTurn = 2; }
  } else next.turn = opponent(side);
  return { game: next, ended: false };
}

function contiguousLength(board, size, r, c, dr, dc, side) {
  let n = 1;
  for (let k = 1; ; k++) {
    const rr = r + dr * k, cc = c + dc * k;
    if (!inBoard(rr, cc, size) || board[rcToIndex(rr, cc, size)] !== side) break;
    n++;
  }
  for (let k = 1; ; k++) {
    const rr = r - dr * k, cc = c - dc * k;
    if (!inBoard(rr, cc, size) || board[rcToIndex(rr, cc, size)] !== side) break;
    n++;
  }
  return n;
}

function countRenjuFourDirections(board, size, r, c) {
  let count = 0;
  for (const [dr, dc] of LINE_DIRS) {
    let wins = 0;
    for (let t = -5; t <= 5; t++) {
      const rr = r + dr * t, cc = c + dc * t;
      if (!inBoard(rr, cc, size)) continue;
      const i = rcToIndex(rr, cc, size);
      if (board[i] != null) continue;
      board[i] = "B";
      const len = contiguousLength(board, size, rr, cc, dr, dc, "B");
      board[i] = null;
      if (len === 5) wins++;
    }
    if (wins > 0) count++;
  }
  return count;
}

function countRenjuOpenThreeDirections(board, size, r, c) {
  let count = 0;
  for (const [dr, dc] of LINE_DIRS) {
    let createsOpenFour = false;
    for (let t = -4; t <= 4 && !createsOpenFour; t++) {
      const rr = r + dr * t, cc = c + dc * t;
      if (!inBoard(rr, cc, size)) continue;
      const i = rcToIndex(rr, cc, size);
      if (board[i] != null) continue;
      board[i] = "B";
      const lineLen = contiguousLength(board, size, rr, cc, dr, dc, "B");
      if (lineLen <= 4) {
        let winPoints = 0;
        for (let u = -5; u <= 5; u++) {
          const ar = r + dr * u, ac = c + dc * u;
          if (!inBoard(ar, ac, size)) continue;
          const ai = rcToIndex(ar, ac, size);
          if (board[ai] != null) continue;
          board[ai] = "B";
          const len = contiguousLength(board, size, ar, ac, dr, dc, "B");
          board[ai] = null;
          if (len === 5) winPoints++;
        }
        if (winPoints >= 2) createsOpenFour = true;
      }
      board[i] = null;
    }
    if (createsOpenFour) count++;
  }
  return count;
}

// ---------- Xiangqi ----------
function newXiangqi(rules = normalizeRules("xiangqi", {})) {
  const b = Array(90).fill(null);
  const put = (r, c, p) => b[r * 9 + c] = p;
  const back = ["R","H","E","A","K","A","E","H","R"];
  for (let c = 0; c < 9; c++) { put(0, c, "b" + back[c]); put(9, c, "r" + back[c]); }
  put(2,1,"bC"); put(2,7,"bC"); put(7,1,"rC"); put(7,7,"rC");
  for (const c of [0,2,4,6,8]) { put(3,c,"bP"); put(6,c,"rP"); }
  return { type: "xiangqi", rows: 10, cols: 9, board: b, turn: "R", moveNumber: 0, ended: false, lastMove: null, rules };
}

function applyXiangqi(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const from = Number(msg.from), to = Number(msg.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= 90 || to < 0 || to >= 90) throw new Error("移動座標不合法。");
  const color = side === "R" ? "r" : "b";
  const sim = simulateXiangqiMove(game.board, color, from, to);
  if (!sim) throw new Error("此步不符合象棋規則，或會讓自己的將／帥被將軍。");
  const next = structuredClone(game);
  next.board = sim.board;
  next.moveNumber++;
  next.lastMove = { from, to, side };
  const enemyColor = color === "r" ? "b" : "r";
  const enemySide = side === "R" ? "B" : "R";
  if (!findXiangqiKing(next.board, enemyColor)) {
    next.ended = true;
    return { game: next, ended: true, result: { winner: side, reason: "將／帥被吃" } };
  }
  if (!hasAnyXiangqiLegalMove(next.board, enemyColor)) {
    next.ended = true;
    const checked = isXiangqiInCheck(next.board, enemyColor);
    if (checked || next.rules?.stalemateLoss !== false) return { game: next, ended: true, result: { winner: side, reason: checked ? "將死" : "困斃（無合法步）" } };
    return { game: next, ended: true, result: { winner: null, reason: "無合法步，依房間設定判和" } };
  }
  next.turn = enemySide;
  return { game: next, ended: false };
}

function simulateXiangqiMove(board, color, from, to) {
  const piece = board[from];
  if (!piece || piece[0] !== color) return null;
  if (board[to]?.[0] === color) return null;
  if (!xiangqiPseudoLegal(board, from, to)) return null;
  const b = board.slice();
  b[to] = b[from]; b[from] = null;
  if (!findXiangqiKing(b, color) || isXiangqiInCheck(b, color)) return null;
  return { board: b };
}

function xiangqiPseudoLegal(board, from, to) {
  const p = board[from]; if (!p) return false;
  const color = p[0], type = p[1];
  const fr = Math.floor(from / 9), fc = from % 9, tr = Math.floor(to / 9), tc = to % 9;
  const dr = tr - fr, dc = tc - fc, adr = Math.abs(dr), adc = Math.abs(dc);
  if (!inBoard(tr, tc, 10, 9)) return false;
  if (board[to]?.[0] === color) return false;

  if (type === "R") return (fr === tr || fc === tc) && countBetween(board, fr, fc, tr, tc, 9) === 0;
  if (type === "C") {
    if (!(fr === tr || fc === tc)) return false;
    const screens = countBetween(board, fr, fc, tr, tc, 9);
    return board[to] ? screens === 1 : screens === 0;
  }
  if (type === "H") {
    if (!((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return false;
    const legR = fr + (adr === 2 ? Math.sign(dr) : 0);
    const legC = fc + (adc === 2 ? Math.sign(dc) : 0);
    return !board[legR * 9 + legC];
  }
  if (type === "E") {
    if (adr !== 2 || adc !== 2) return false;
    if (color === "r" && tr < 5) return false;
    if (color === "b" && tr > 4) return false;
    return !board[(fr + dr / 2) * 9 + (fc + dc / 2)];
  }
  if (type === "A") {
    return adr === 1 && adc === 1 && tc >= 3 && tc <= 5 && (color === "r" ? tr >= 7 && tr <= 9 : tr >= 0 && tr <= 2);
  }
  if (type === "K") {
    const target = board[to];
    if (target && target[0] !== color && target[1] === "K" && fc === tc && countBetween(board, fr, fc, tr, tc, 9) === 0) return true;
    return adr + adc === 1 && tc >= 3 && tc <= 5 && (color === "r" ? tr >= 7 && tr <= 9 : tr >= 0 && tr <= 2);
  }
  if (type === "P") {
    if (color === "r") {
      if (dr === -1 && dc === 0) return true;
      if (fr <= 4 && dr === 0 && adc === 1) return true;
    } else {
      if (dr === 1 && dc === 0) return true;
      if (fr >= 5 && dr === 0 && adc === 1) return true;
    }
    return false;
  }
  return false;
}

function countBetween(board, fr, fc, tr, tc, cols) {
  const dr = tr - fr, dc = tc - fc;
  if (!(fr === tr || fc === tc || Math.abs(dr) === Math.abs(dc))) return Infinity;
  let count = 0;
  const sr = Math.sign(dr), sc = Math.sign(dc);
  let r = fr + sr, c = fc + sc;
  while (r !== tr || c !== tc) {
    if (board[r * cols + c]) count++;
    r += sr; c += sc;
  }
  return count;
}

function findXiangqiKing(board, color) { return board.findIndex((p) => p === color + "K"); }
function isXiangqiInCheck(board, color) {
  const king = findXiangqiKing(board, color);
  if (king < 0) return true;
  const enemy = color === "r" ? "b" : "r";
  for (let from = 0; from < board.length; from++) {
    if (board[from]?.[0] !== enemy) continue;
    if (xiangqiPseudoLegal(board, from, king)) return true;
  }
  return false;
}
function hasAnyXiangqiLegalMove(board, color) {
  for (let from = 0; from < 90; from++) {
    if (board[from]?.[0] !== color) continue;
    for (let to = 0; to < 90; to++) if (simulateXiangqiMove(board, color, from, to)) return true;
  }
  return false;
}

// ---------- Western chess ----------
function newChess(rules = normalizeRules("chess", {})) {
  const b = Array(64).fill(null);
  const back = ["R","N","B","Q","K","B","N","R"];
  for (let c = 0; c < 8; c++) { b[c] = "b" + back[c]; b[8 + c] = "bP"; b[48 + c] = "wP"; b[56 + c] = "w" + back[c]; }
  return { type: "chess", board: b, turn: "W", moveNumber: 0, ended: false, lastMove: null, castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null, rules, checks:{W:0,B:0}, halfmoveClock:0, positionHistory:[] };
}

function applyChess(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const from = Number(msg.from), to = Number(msg.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= 64 || to < 0 || to >= 64) throw new Error("移動座標不合法。");
  const color = side === "W" ? "w" : "b";
  const next = simulateChessMove(game, color, from, to, msg.promotion);
  if (!next) throw new Error("此步不符合西洋棋規則，或會讓自己的王被將軍。");
  next.turn = side === "W" ? "B" : "W";
  next.moveNumber = game.moveNumber + 1;
  next.lastMove = { from, to, side, promotion: msg.promotion || null };
  const enemyColor = color === "w" ? "b" : "w";
  const enemySide = side === "W" ? "B" : "W";
  const rules = next.rules || normalizeRules("chess", {});
  const movedPiece = game.board[from], capturedPiece = game.board[to];
  next.halfmoveClock = (movedPiece?.[1] === "P" || capturedPiece) ? 0 : (Number(game.halfmoveClock)||0) + 1;
  if (!next.checks) next.checks = {W:0,B:0};
  if (isChessInCheck(next.board, enemyColor)) next.checks[side] = (next.checks[side]||0) + 1;
  const posKey = chessPositionKey(next);
  next.positionHistory = [...(game.positionHistory || []), posKey].slice(-300);
  if (rules.variant === "threecheck" && next.checks[side] >= 3) { next.ended=true; return {game:next,ended:true,result:{winner:side,reason:"Three-Check：先完成三次將軍"}}; }
  if (rules.variant === "koth") { const kingSq = next.board.findIndex((p)=>p===color+"K"); if ([27,28,35,36].includes(kingSq)) { next.ended=true; return {game:next,ended:true,result:{winner:side,reason:"King of the Hill：王安全進入中央四格"}}; } }
  if (rules.threefold && repetitionCount(next.positionHistory, posKey) >= 3) { next.ended=true; return {game:next,ended:true,result:{winner:null,reason:"三次重複局面和棋"}}; }
  if (rules.fiftyMove && next.halfmoveClock >= 100) { next.ended=true; return {game:next,ended:true,result:{winner:null,reason:"50-move Rule 和棋"}}; }
  if (rules.insufficient && isInsufficientMaterial(next.board)) { next.ended=true; return {game:next,ended:true,result:{winner:null,reason:"子力不足和棋"}}; }
  if (!hasAnyChessLegalMove(next, enemyColor)) {
    next.ended = true;
    if (isChessInCheck(next.board, enemyColor)) {
      return { game: next, ended: true, result: { winner: side, reason: "將死" } };
    }
    return { game: next, ended: true, result: { winner: null, reason: "逼和（Stalemate）" } };
  }
  return { game: next, ended: false };
}

function chessPositionKey(game) {
  return game.board.map((x)=>x||".").join("") + "|" + game.turn + "|" + JSON.stringify(game.castling) + "|" + String(game.enPassant ?? "-");
}
function repetitionCount(history, key) { let n=0; for (const x of history || []) if (x===key) n++; return n; }
function isInsufficientMaterial(board) {
  const pieces = board.map((p,i)=>p?{p,i}:null).filter(Boolean).filter((x)=>x.p[1]!=="K");
  if (!pieces.length) return true;
  if (pieces.length===1 && ["B","N"].includes(pieces[0].p[1])) return true;
  if (pieces.every((x)=>x.p[1]==="B")) {
    const colors = new Set(pieces.map((x)=>((Math.floor(x.i/8)+x.i%8)&1)));
    if (colors.size===1) return true;
  }
  return false;
}

function simulateChessMove(game, color, from, to, promotion) {
  const board = game.board;
  const piece = board[from];
  if (!piece || piece[0] !== color || board[to]?.[0] === color) return null;
  const type = piece[1];
  const fr = Math.floor(from / 8), fc = from % 8, tr = Math.floor(to / 8), tc = to % 8;
  const dr = tr - fr, dc = tc - fc, adr = Math.abs(dr), adc = Math.abs(dc);
  const b = board.slice();
  const castling = { ...game.castling };
  let enPassant = null;
  let legal = false;

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    if (dc === 0 && dr === dir && !board[to]) legal = true;
    else if (dc === 0 && dr === 2 * dir && fr === startRow && !board[to] && !board[(fr + dir) * 8 + fc]) { legal = true; enPassant = (fr + dir) * 8 + fc; }
    else if (adc === 1 && dr === dir && board[to]?.[0] !== color && board[to]) legal = true;
    else if (adc === 1 && dr === dir && game.enPassant === to) {
      const victim = fr * 8 + tc;
      if (board[victim] === (color === "w" ? "bP" : "wP")) { legal = true; b[victim] = null; }
    }
  } else if (type === "N") legal = (adr === 2 && adc === 1) || (adr === 1 && adc === 2);
  else if (type === "B") legal = adr === adc && countBetween(board, fr, fc, tr, tc, 8) === 0;
  else if (type === "R") legal = (fr === tr || fc === tc) && countBetween(board, fr, fc, tr, tc, 8) === 0;
  else if (type === "Q") legal = ((adr === adc) || fr === tr || fc === tc) && countBetween(board, fr, fc, tr, tc, 8) === 0;
  else if (type === "K") {
    if (Math.max(adr, adc) === 1) legal = true;
    else if (dr === 0 && adc === 2) {
      const kingStart = color === "w" ? 60 : 4;
      if (from !== kingStart || isChessInCheck(board, color)) return null;
      const kingside = dc === 2;
      const right = color + (kingside ? "K" : "Q");
      if (!castling[right]) return null;
      const rookFrom = color === "w" ? (kingside ? 63 : 56) : (kingside ? 7 : 0);
      const rookTo = color === "w" ? (kingside ? 61 : 59) : (kingside ? 5 : 3);
      if (board[rookFrom] !== color + "R") return null;
      const betweenCols = kingside ? [5,6] : [1,2,3];
      if (betweenCols.some((c) => board[fr * 8 + c])) return null;
      const transit = fr * 8 + (fc + Math.sign(dc));
      if (isSquareAttacked(board, transit, color === "w" ? "b" : "w") || isSquareAttacked(board, to, color === "w" ? "b" : "w")) return null;
      b[rookTo] = b[rookFrom]; b[rookFrom] = null;
      legal = true;
    }
  }
  if (!legal) return null;

  const captured = board[to];
  b[to] = b[from]; b[from] = null;
  if (type === "P" && (tr === 0 || tr === 7)) {
    const choice = String(promotion || "Q").toUpperCase();
    b[to] = color + (["Q","R","B","N"].includes(choice) ? choice : "Q");
  }
  if (type === "K") { castling[color + "K"] = false; castling[color + "Q"] = false; }
  if (type === "R") revokeRookCastling(castling, color, from);
  if (captured?.[1] === "R") revokeRookCastling(castling, captured[0], to);

  if (isChessInCheck(b, color)) return null;
  return { ...structuredClone(game), board: b, castling, enPassant, ended: false };
}

function revokeRookCastling(castling, color, square) {
  if (color === "w" && square === 63) castling.wK = false;
  if (color === "w" && square === 56) castling.wQ = false;
  if (color === "b" && square === 7) castling.bK = false;
  if (color === "b" && square === 0) castling.bQ = false;
}

function isChessInCheck(board, color) {
  const king = board.findIndex((p) => p === color + "K");
  if (king < 0) return true;
  return isSquareAttacked(board, king, color === "w" ? "b" : "w");
}

function isSquareAttacked(board, target, byColor) {
  const tr = Math.floor(target / 8), tc = target % 8;
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || p[0] !== byColor) continue;
    const fr = Math.floor(from / 8), fc = from % 8;
    const dr = tr - fr, dc = tc - fc, adr = Math.abs(dr), adc = Math.abs(dc);
    if (p[1] === "P") {
      const dir = byColor === "w" ? -1 : 1;
      if (dr === dir && adc === 1) return true;
    } else if (p[1] === "N" && ((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return true;
    else if (p[1] === "B" && adr === adc && countBetween(board, fr, fc, tr, tc, 8) === 0) return true;
    else if (p[1] === "R" && (fr === tr || fc === tc) && countBetween(board, fr, fc, tr, tc, 8) === 0) return true;
    else if (p[1] === "Q" && ((adr === adc) || fr === tr || fc === tc) && countBetween(board, fr, fc, tr, tc, 8) === 0) return true;
    else if (p[1] === "K" && Math.max(adr, adc) === 1) return true;
  }
  return false;
}

function hasAnyChessLegalMove(game, color) {
  for (let from = 0; from < 64; from++) {
    if (game.board[from]?.[0] !== color) continue;
    for (let to = 0; to < 64; to++) if (simulateChessMove(game, color, from, to, "Q")) return true;
  }
  return false;
}

// ---------- Reversi ----------
function newReversi(rules = normalizeRules("reversi", {})) {
  const size = rules.boardSize || 8, b = Array(size * size).fill(null), m = size / 2;
  b[(m-1)*size+(m-1)] = "W"; b[(m-1)*size+m] = "B"; b[m*size+(m-1)] = "B"; b[m*size+m] = "W";
  return { type:"reversi", size, board:b, turn:"B", moveNumber:0, ended:false, lastMove:null, rules };
}
function applyReversi(game, side, msg) {
  if (game.ended) throw new Error("棋局已結束。");
  if (game.turn !== side) throw new Error("尚未輪到你。");
  const size=game.size, r=Number(msg.r), c=Number(msg.c);
  if (!Number.isInteger(r)||!Number.isInteger(c)||!inBoard(r,c,size)) throw new Error("落子座標不合法。");
  const flips=reversiFlips(game.board,side,r,c,size);
  if (!flips.length) throw new Error("此處不能形成夾擊翻子。");
  const next=structuredClone(game), idx=r*size+c; next.board[idx]=side; for(const f of flips) next.board[f]=side;
  next.moveNumber++; next.lastMove={r,c,side,flipped:flips.length}; const enemy=opponent(side);
  if (hasReversiMove(next.board,enemy,size)) next.turn=enemy; else if (hasReversiMove(next.board,side,size)) next.turn=side; else {
    next.ended=true; const B=next.board.filter((x)=>x==="B").length,W=next.board.filter((x)=>x==="W").length;
    let winner=null; if(B!==W){ const normal=(next.rules?.objective||"normal")==="normal"; winner=normal?(B>W?"B":"W"):(B<W?"B":"W"); }
    return {game:next,ended:true,result:{winner,reason:(next.rules?.objective==="misere"?"Anti-Othello 終局（少者勝） ":"終局棋子數 ")+B+" : "+W}};
  }
  return {game:next,ended:false};
}
function reversiFlips(board,side,r,c,size) {
  if(board[r*size+c]) return []; const enemy=opponent(side),all=[];
  for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){const line=[];let rr=r+dr,cc=c+dc;while(inBoard(rr,cc,size)&&board[rr*size+cc]===enemy){line.push(rr*size+cc);rr+=dr;cc+=dc}if(line.length&&inBoard(rr,cc,size)&&board[rr*size+cc]===side)all.push(...line)}
  return all;
}
function hasReversiMove(board,side,size) { for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(reversiFlips(board,side,r,c,size).length)return true;return false; }

const APP_HTML = String.raw`<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0e15">
<title>BoardVerse 多人棋室</title>
<style>
:root{color-scheme:dark;--bg:#11100d;--panel:#17140f;--panel2:#1d1912;--panel3:#14110d;--text:#f3ede2;--muted:#aa9e8b;--line:#3b3327;--accent:#c3a15f;--accent2:#e8d9ad;--good:#55d68b;--warn:#ffc86b;--danger:#ff747b;--wood:#c99a50;--wood2:#b27f39;--ink:#4a3018;--radius:16px;--shadow:0 18px 48px rgba(0,0,0,.28)}
*{box-sizing:border-box}html,body{margin:0;max-width:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Noto Sans TC","Microsoft JhengHei",sans-serif}body{min-height:100vh;overflow-x:hidden}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.48}.hidden{display:none!important}.muted{color:var(--muted)}.small{font-size:13px}.eyebrow{font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase;color:var(--accent2)}
.app-frame{width:100%;min-width:0;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:12px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.brand{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{width:42px;height:42px;border:1px solid #4a4031;border-radius:13px;display:grid;place-items:center;background:linear-gradient(145deg,#242018,#14110d);font-weight:900;color:var(--accent2);flex:0 0 auto}.brand h1{font-size:20px;margin:0}.brand p{font-size:12px;color:var(--muted);margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.top-tools{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.compact-select,.compact-btn{height:38px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);padding:0 10px}.compact-btn{display:inline-flex;align-items:center;gap:7px}.sound-wrap{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--panel);padding:5px 8px;border-radius:10px}.sound-wrap input[type=range]{width:84px}.card{min-width:0;background:linear-gradient(180deg,rgba(255,255,255,.025),transparent),var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.workspace{flex:1;min-height:0;overflow:auto}.lobby-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(310px,.95fr);gap:14px}.hero{padding:22px;min-height:215px;display:flex;flex-direction:column;justify-content:space-between;background:radial-gradient(circle at 90% 0%,rgba(104,173,255,.14),transparent 18rem),var(--panel)}.hero h2{font-size:clamp(26px,3vw,44px);line-height:1.05;margin:7px 0 10px}.hero p{color:#c2ccda;line-height:1.7;margin:0;max-width:780px}.hero-pills{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px}.pill{font-size:12px;border:1px solid #30425a;background:#121d2b;padding:6px 9px;border-radius:999px;color:#bcd8fb}.forms{display:grid;gap:14px}.panel{padding:18px}.panel h3,.rooms h3,.game-catalog h3{margin:0 0 14px;font-size:18px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:11px}.field{min-width:0}.field.full{grid-column:1/-1}.field label,.field-label{display:flex;align-items:center;gap:6px;font-size:13px;color:#c7d2e0;margin-bottom:6px}.field input,.field select{width:100%;min-width:0;height:42px;border:1px solid #324156;border-radius:11px;background:#0c121a;color:var(--text);padding:0 11px}.check{display:flex!important;align-items:center;gap:9px;margin:2px 0 0!important}.check input{width:18px!important;height:18px!important}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.btn{border:1px solid #927642;background:linear-gradient(135deg,#806a3c 0%,#c3a15f 50%,#e7d7a8 100%);color:#211a0f;font-weight:800;min-height:40px;padding:9px 13px;border-radius:11px}.btn.secondary{border-color:#4b4030;background:#211c14;color:#e9e0cf}.btn.ghost{border-color:#4b4030;background:transparent;color:#e1d6c3}.btn.danger{border-color:#a73c45;background:#5a2229;color:#ffdfe2}.notice,.room-notice{min-height:21px;margin-top:10px;font-size:13px;color:var(--muted)}.err{color:#ff959b}.setup{grid-column:1/-1;padding:16px;border:1px solid #6b5327;border-radius:14px;background:#211b10;color:#f7dfae}.setup p{margin:6px 0 0}.game-catalog,.rooms{padding:18px}.game-catalog,.rooms{grid-column:1/-1}.game-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.game-card{position:relative;border:1px solid var(--line);border-radius:13px;background:#0d141e;padding:12px;padding-top:43px}.game-card strong{font-size:14px}.game-card p{font-size:12px;line-height:1.55;color:var(--muted);margin:5px 0 0}.game-rule-detail{position:absolute;right:8px;top:8px;min-height:27px;padding:4px 8px;border-radius:8px;font-size:11px}.rule-detail-list{display:grid;gap:10px}.rule-detail-item{border:1px solid var(--line);border-radius:11px;padding:10px;background:var(--panel3)}.rule-detail-item strong{display:block;margin-bottom:5px}.rule-detail-item p{margin:4px 0;line-height:1.6}.rule-detail-options{margin:7px 0 0;padding-left:19px}.rule-detail-options li{margin:5px 0;line-height:1.5}.rooms-head,.game-catalog-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.rooms-toolbar{margin:14px 0 12px}.room-search{width:100%;height:42px;border:1px solid #324156;border-radius:11px;background:#0c121a;color:var(--text);padding:0 12px}.room-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.room-column{min-width:0;border:1px solid var(--line);background:#0a1018;border-radius:13px;padding:11px}.room-column h4{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 9px;font-size:14px}.room-count{font-size:11px;color:var(--muted);font-weight:600}.room-list{display:grid;gap:8px}.room-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:#0c131c;border-radius:12px;padding:11px}.room-row strong{display:block}.room-row-meta{margin-top:3px}.room-row .btn{flex:0 0 auto}
.room-gate{max-width:760px;margin:20px auto;padding:22px}.gate-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.gate-title{margin:4px 0 3px;font-size:25px}.gate-status{padding:5px 9px;border-radius:999px;border:1px solid var(--line);font-size:12px;color:var(--muted)}.role-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.role-choice{border:1px solid #34465d;background:#111a25;color:var(--text);border-radius:14px;padding:14px;text-align:left;min-height:92px}.role-choice strong{display:block;font-size:16px}.role-choice span{display:block;color:var(--muted);font-size:12px;margin-top:4px;line-height:1.5}.gate-back{margin-top:13px}
.room-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.72fr);gap:12px;min-height:0;height:100%}.room-main{display:flex;flex-direction:column;gap:10px;min-height:0}.room-header{padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px}.room-title h2{font-size:19px;margin:3px 0 1px}.room-meta{font-size:12px;color:var(--muted)}.room-actions{display:flex;gap:7px;flex-wrap:wrap}.players{display:grid;grid-template-columns:1fr 1fr;gap:10px}.player-card{display:flex;align-items:center;gap:10px;padding:10px 12px}.player-card.active{border-color:#568ed2;background:#10233b}.seat-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#192738;border:1px solid #39506c;font-weight:900}.board-card{flex:1;min-height:320px;padding:10px}.board-stage{height:100%;min-height:300px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#0a0f16;padding:4px}.board-fit{position:relative;overflow:visible;flex:none}.board-fit>.board{position:absolute;left:0;top:0;max-width:none;max-height:none;touch-action:manipulation;container-type:inline-size;transform-origin:top left}.board{position:relative;max-width:100%;max-height:100%;touch-action:manipulation;container-type:inline-size;transform-origin:center center}.line-board{aspect-ratio:1/1;background:linear-gradient(135deg,var(--wood),var(--wood2));border:8px solid #9a6a31;border-radius:5px}.xiangqi-board{aspect-ratio:9/10;background:linear-gradient(145deg,#d4ad68,#bd8c49);border:8px solid #8d5f2b;border-radius:6px}.square-board{aspect-ratio:1/1;display:grid;grid-template-columns:repeat(8,1fr);overflow:hidden;border-radius:5px;border:6px solid #222b37}.reversi-board{background:#245e42}.go-estimate{margin-top:8px;padding:8px 10px;border:1px solid #8f7749;border-radius:10px;background:linear-gradient(135deg,rgba(128,106,60,.16),rgba(231,215,168,.07));color:var(--text);font-size:12px;line-height:1.5}.theme-setting{display:flex;align-items:center;justify-content:space-between;gap:10px}.top-theme-setting{justify-content:flex-start;gap:6px;white-space:nowrap}.top-theme-setting #pageBgLabel{font-size:12px;color:var(--muted)}.top-theme-setting .theme-choice{flex:0 0 auto}.theme-choice{display:inline-flex;border:1px solid var(--line);border-radius:10px;padding:2px;background:var(--panel3)}.theme-option{min-width:48px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-weight:800}.theme-option[aria-checked="true"]{background:linear-gradient(135deg,#806a3c 0%,#c3a15f 50%,#e7d7a8 100%);color:#211a0f;box-shadow:0 2px 10px rgba(128,106,60,.2)}body.page-theme-black{background:#11100d!important;color-scheme:dark;--bg:#11100d;--panel:#17140f;--panel2:#1d1912;--panel3:#14110d;--text:#f3ede2;--muted:#aa9e8b;--line:#3b3327;--shadow:0 18px 48px rgba(0,0,0,.24)}body.page-theme-white{background:#f7f4ec!important;color-scheme:light;--bg:#f7f4ec;--panel:#fbf9f3;--panel2:#f0eadf;--panel3:#fffdf8;--text:#292319;--muted:#766c5d;--line:#d8cdbb;--shadow:0 18px 48px rgba(73,55,14,.09)}body.page-theme-white .field input,body.page-theme-white .field select,body.page-theme-white .room-search,body.page-theme-white .compact-select,body.page-theme-white .compact-btn,body.page-theme-white .sound-wrap,body.page-theme-white .game-card,body.page-theme-white .room-column,body.page-theme-white .room-row,body.page-theme-white .setting-row input[type=number],body.page-theme-white .setting-row select,body.page-theme-white .setting-check,body.page-theme-white .queue-settings select,body.page-theme-white .replay-row,body.page-theme-white .replay-stage,body.page-theme-white .dialog-card,body.page-theme-white .popover,body.page-theme-white .toast{background:var(--panel3);color:var(--text);border-color:var(--line)}body.page-theme-white .setting-label,body.page-theme-white .field label,body.page-theme-white .field-label,body.page-theme-white .result-reason,body.page-theme-white .popover p,body.page-theme-white .dialog-card p{color:#554c3c}.eyebrow,.brand-mark,.turn-banner{background:linear-gradient(135deg,#806a3c 0%,#c3a15f 50%,#e7d7a8 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.board-bg-setting{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08)}.board-bg-setting label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}.board-bg-setting input[type=color]{width:38px;height:30px;padding:2px;border:1px solid #40506a;border-radius:8px;background:#0c121a;cursor:pointer}.board-bg-setting .btn{min-height:30px;padding:4px 9px;font-size:12px}.board>svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.point-btn{position:absolute;width:min(5.2%,34px);aspect-ratio:1;min-width:0;min-height:0;border:0;background:transparent;padding:0;line-height:1;-webkit-appearance:none;appearance:none;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center}.xiangqi-board .point-btn{width:8.6cqw;height:8.6cqw;max-width:48px;max-height:48px;aspect-ratio:auto;min-width:0;min-height:0}.line-board .point-btn{width:var(--point-size,6.2cqw);max-width:none}.point-btn.last::after,.sq.last::after{content:"";position:absolute;width:24%;aspect-ratio:1;border-radius:50%;background:#ffcf66;box-shadow:0 0 0 2px rgba(20,20,20,.5)}.line-board .point-btn.last::after{z-index:3}.hide-last-move-dot .line-board .point-btn.last::after{display:none}.last-move-setting{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12px;color:var(--muted);user-select:none}.last-move-setting input{accent-color:#c3a15f}.point-btn.selected{outline:3px solid #c3a15f;outline-offset:2px}.stone{display:block;width:84%;aspect-ratio:1;border-radius:50%;position:relative;z-index:1}.stone.black{background-color:#050607;background-image:radial-gradient(circle at 35% 28%,#4d545c 0,#101317 42%,#030405 75%);box-shadow:0 3px 7px rgba(0,0,0,.48),inset 0 0 0 1px #5d646a}.stone.white{background-color:#f4f6f8;background-image:radial-gradient(circle at 35% 25%,#fff 0,#e8edf2 48%,#aab3bd 100%);box-shadow:0 3px 7px rgba(0,0,0,.42),inset 0 0 0 2px #606a74}.xq-piece{width:94%;height:94%;aspect-ratio:auto;border-radius:50%;display:grid;place-items:center;background:#f3db9e;border:2px solid #452b17;font-family:"Noto Serif TC","PMingLiU",serif;font-weight:900;font-size:clamp(18px,5.6cqw,31px);box-shadow:0 2px 5px rgba(0,0,0,.35);z-index:1}.xq-piece.red{color:#b32922;border-color:#b32922}.xq-piece.black{color:#1b1d1f}.sq{position:relative;border:0;padding:0;display:grid;place-items:center;aspect-ratio:1}.sq.light{background:#e5d0a6}.sq.dark{background:#7e6549}.reversi-board .sq.light,.reversi-board .sq.dark{background:#2c7753;border:1px solid #1d4f38}.sq.selected{box-shadow:inset 0 0 0 4px #69afff}.chess-piece{position:relative;z-index:1;font-family:"Arial Unicode MS","Segoe UI Symbol","Noto Sans Symbols 2",serif;font-size:clamp(20px,9cqw,52px);line-height:1;font-weight:400;text-shadow:0 2px 2px rgba(0,0,0,.35)}.chess-piece.white{color:#faf7ee;-webkit-text-stroke:1.25px #1d2229;text-shadow:0 1px 0 #111,0 3px 4px rgba(0,0,0,.45)}.chess-piece.black{color:#11151b;-webkit-text-stroke:1px #d9dde2;text-shadow:0 2px 2px rgba(255,255,255,.16)}
.side-stack{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:2px}.status-card,.chat-card,.rules-card,.queue-card{padding:13px}.turn-banner{font-size:18px;font-weight:900}.role-line{font-size:12px;color:var(--muted);margin-top:3px}.result-banner{margin-top:10px;padding:10px;border-radius:11px;border:1px solid var(--line)}.result-banner.win{background:#10271a;border-color:#2d7650}.result-banner.loss{background:#2b1417;border-color:#7d3940}.result-banner.draw{background:#282312;border-color:#7e6d32}.result-title{font-weight:900}.result-reason{font-size:12px;margin-top:3px;color:#c5d0dd}.replay-list{display:grid;gap:7px;margin-top:9px}.replay-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid var(--line);border-radius:10px;background:#0c131c}.replay-row .btn{min-height:34px;padding:6px 9px}.replay-dialog{width:min(980px,100%);max-height:min(90vh,820px)}.replay-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(220px,.65fr);gap:12px}.replay-stage{min-width:0;display:grid;place-items:center;background:#090f16;border:1px solid var(--line);border-radius:12px;padding:8px}.replay-side{min-width:0}.replay-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.replay-controls input[type=range]{flex:1;min-width:140px}.replay-step{font-size:12px;color:var(--muted);margin-top:7px}.pending{padding:12px;border:1px solid #69572e;background:#211c11;border-radius:14px}.pending-row,.queue-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.07)}.pending-row:first-child,.queue-row:first-child{border-top:0}.queue-head,.chat-head,.collapse-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.queue-settings{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.queue-settings select{width:100%;height:36px;background:#0c121a;color:var(--text);border:1px solid #334258;border-radius:9px}.chat-list{height:190px;overflow:auto;display:flex;flex-direction:column;gap:7px;margin-top:9px;padding-right:3px}.chat-empty{font-size:12px;color:var(--muted)}.chat-msg{align-self:flex-start;max-width:88%}.chat-msg.me{align-self:flex-end}.chat-meta{font-size:10px;color:var(--muted);margin:0 5px 2px}.chat-bubble{background:#1b2737;border:1px solid #31435a;border-radius:12px;padding:7px 9px;font-size:13px;white-space:pre-wrap;word-break:break-word}.chat-msg.me .chat-bubble{background:#14355a;border-color:#2d6da9}.chat-form{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:9px}.chat-form input{min-width:0;height:39px;border-radius:10px;border:1px solid #334258;background:#0b1119;color:var(--text);padding:0 10px}.rules-text{font-size:12px;color:#bbc7d5;line-height:1.65}.collapse-btn{border:0;background:transparent;color:var(--muted);font-size:18px;line-height:1;padding:4px 7px}.collapsed-body.hidden{display:none!important}
.rule-config{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.rule-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.setting-row{min-width:0}.setting-label{font-size:12px;color:#c7d2e0;display:flex;align-items:center;gap:5px;margin-bottom:5px}.setting-row input[type=number],.setting-row select{width:100%;height:38px;border-radius:9px;border:1px solid #334258;background:#0c121a;color:var(--text);padding:0 9px}.setting-check{display:flex;align-items:center;gap:8px;min-height:38px;border:1px solid #334258;background:#0c121a;border-radius:9px;padding:0 9px}.info-btn{width:22px;height:22px;border:1px solid #927642;border-radius:50%;background:linear-gradient(135deg,#806a3c,#c3a15f 55%,#e7d7a8);color:#211a0f;font-size:12px;font-weight:900;padding:0;display:inline-grid;place-items:center;flex:0 0 auto}.info-btn:focus-visible,.btn:focus-visible,.compact-btn:focus-visible,.compact-select:focus-visible,input:focus-visible,select:focus-visible,.role-choice:focus-visible{outline:3px solid rgba(195,161,95,.42);outline-offset:2px}
.overlay{position:fixed;inset:0;z-index:1000;background:rgba(3,7,12,.72);display:grid;place-items:center;padding:16px}.dialog-card{width:min(520px,100%);max-height:min(78vh,680px);overflow:auto;border:1px solid #3a4c63;background:#111923;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:18px}.dialog-card h3{margin:0 0 8px}.dialog-card p{color:#c1ccda;line-height:1.65;margin:7px 0}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.popover{position:fixed;z-index:1100;width:min(360px,calc(100vw - 24px));max-height:min(60vh,520px);overflow:auto;border:1px solid #425773;background:#111a25;border-radius:15px;padding:13px;box-shadow:0 20px 60px rgba(0,0,0,.55)}.popover h4{margin:0 0 6px}.popover p{font-size:13px;color:#c7d2df;line-height:1.6;margin:0}.toast-stack{position:fixed;z-index:1200;right:14px;bottom:14px;display:flex;flex-direction:column;gap:8px;width:min(360px,calc(100vw - 28px));pointer-events:none}.toast{pointer-events:auto;border:1px solid #3a4d64;background:#121b26;border-radius:12px;padding:10px 12px;box-shadow:0 14px 40px rgba(0,0,0,.42);font-size:13px}.toast.bad{border-color:#7f4046;background:#2a171a}.toast.good{border-color:#326a4b;background:#10251a}
@media (min-width:960px) and (orientation:landscape){body.room-mode{height:100vh;overflow:hidden;display:grid;place-items:center}body.room-mode .app-frame{width:min(100vw,177.7778vh);height:auto;max-height:100vh;aspect-ratio:16/9;padding:12px;overflow:hidden}body.room-mode .workspace{overflow:hidden}body.room-mode .room-layout{height:100%}body.room-mode .board-card{min-height:0}body.room-mode .board-stage{min-height:0}body.room-mode .room-main{height:100%}body.room-mode .side-stack{height:100%}body:not(.room-mode){height:auto;overflow-y:auto;display:block}body:not(.room-mode) .app-frame{aspect-ratio:auto;max-height:none;overflow:visible}body:not(.room-mode) .workspace{overflow:visible}body:not(.room-mode) .lobby-grid{height:auto;overflow:visible}}
@media (max-width:959px){.app-frame{padding:10px}.topbar{align-items:flex-start}.top-tools{max-width:58%}.lobby-grid{grid-template-columns:1fr}.game-catalog{grid-column:auto}.game-list{grid-template-columns:repeat(2,minmax(0,1fr))}.room-layout{grid-template-columns:1fr;height:auto}.board-card{min-height:0}.board-stage{min-height:0}.side-stack{overflow:visible}.players{grid-template-columns:1fr 1fr}.sound-wrap input[type=range]{width:64px}.brand p{display:none}}
@media (max-width:720px){.room-columns{grid-template-columns:1fr}.replay-layout{grid-template-columns:1fr}.replay-dialog{max-height:88vh}}
@media (max-width:560px){.app-frame{padding:8px}.topbar{gap:6px}.brand-mark{width:36px;height:36px}.brand h1{font-size:17px}.top-tools{max-width:66%;gap:5px}.compact-select,.compact-btn{height:34px;padding:0 8px;font-size:12px}.sound-wrap{height:34px;padding:3px 6px}.sound-wrap input[type=range]{display:none}.fields,.rule-fields,.queue-settings{grid-template-columns:1fr}.role-actions{grid-template-columns:1fr}.game-list{grid-template-columns:1fr}.room-header{align-items:flex-start;flex-direction:column}.room-actions{width:100%}.room-actions .btn{flex:1}.players{grid-template-columns:1fr}.board-card{padding:6px}.line-board,.xiangqi-board,.square-board{border-width:5px}.line-board .point-btn{min-width:0}.chess-piece{font-size:clamp(22px,11vw,46px)}.toast-stack{right:8px;bottom:8px;width:calc(100vw - 16px)}}
</style>
</head>
<body>
<div class="app-frame">
  <header class="topbar">
    <div class="brand"><div class="brand-mark">BV</div><div><h1>BoardVerse</h1><p data-i18n="brandSub">多人棋室 · 即時對局 · 觀戰與排隊</p></div></div>
    <div class="top-tools">
      <select id="languageSelect" class="compact-select" aria-label="Language"><option value="zh-Hant">繁體</option><option value="zh-Hans">简体</option><option value="en">English</option></select><div class="theme-setting top-theme-setting"><span id="pageBgLabel">頁面背景</span><div id="pageThemeChoice" class="theme-choice" role="radiogroup" aria-label="頁面背景"><button id="pageBgBlack" class="theme-option" type="button" role="radio" aria-checked="true">黑</button><button id="pageBgWhite" class="theme-option" type="button" role="radio" aria-checked="false">白</button></div></div>
      <div class="sound-wrap"><label class="small"><input id="soundEnabled" type="checkbox" checked> <span data-i18n="sound">音效</span></label><input id="soundVolume" type="range" min="0" max="1" step="0.05" value="0.55" aria-label="Sound volume"></div>
      <button id="notifyBtn" class="compact-btn" type="button" data-i18n="notifications">通知</button>
      <span class="small muted">v__APP_VERSION__</span>
    </div>
  </header>

  <main id="lobby" class="workspace">
    <div class="lobby-grid">
      <section class="hero card"><div><div class="eyebrow">Multiplayer board arena</div><h2 data-i18n="heroTitle">一個房間，認真下完一盤。</h2><p data-i18n="heroText">支援玩家、觀戰、私人房審核、排隊輪替與獨立觀眾聊天室；棋局狀態與勝負由伺服器判定。</p></div><div class="hero-pills"><span class="pill">WebSocket</span><span class="pill" data-i18n="pillSpectate">觀戰</span><span class="pill" data-i18n="pillQueue">排隊制</span><span class="pill" data-i18n="pillResult">勝敗明確</span></div></section>
      <div class="forms">
        <section class="panel card"><h3 data-i18n="createRoom">建立房間</h3><form id="createForm"><div class="fields">
          <div class="field"><label for="createName"><span data-i18n="yourName">你的名稱</span><button type="button" class="info-btn" data-help="name">!</button></label><input id="createName" maxlength="40" required placeholder="Ray"></div>
          <div class="field"><label for="createPassword"><span data-i18n="returnPassword">回場密碼（可不填）</span><button type="button" class="info-btn" data-help="password">!</button></label><input id="createPassword" type="password" maxlength="128" autocomplete="new-password"></div>
          <div class="field"><label for="roomName" data-i18n="roomName">房間名稱</label><input id="roomName" maxlength="40" placeholder="BoardVerse"></div>
          <div class="field"><label for="gameId"><span data-i18n="game">棋類</span><button type="button" class="info-btn" data-help="game">!</button></label><select id="gameId"><option value="go9">圍棋 9×9</option><option value="go13">圍棋 13×13</option><option value="go19">圍棋 19×19</option><option value="gomoku">五子棋</option><option value="renju">連珠 Renju</option><option value="xiangqi">象棋</option><option value="chess">西洋棋</option><option value="reversi">黑白棋 Reversi</option></select></div>
          <label class="check field full"><input id="privateRoom" type="checkbox"><span data-i18n="privateRoom">私人房：玩家入席需房主核准；知道房號者可選觀戰</span></label>
          <label class="check field"><input id="queueEnabledCreate" type="checkbox"><span data-i18n="queueMode">開啟排隊制</span><button type="button" class="info-btn" data-help="queue">!</button></label>
          <div class="field"><label for="rotationCreate"><span data-i18n="rotation">輪替方式</span><button type="button" class="info-btn" data-help="rotation">!</button></label><select id="rotationCreate"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option><option value="host_stays">房主留桌</option></select></div>
        </div><div id="ruleConfig" class="rule-config"><div class="collapse-head"><strong data-i18n="ruleSettings">規則設定</strong><span class="small muted" data-i18n="ruleSettingsHint">每一項 ! 都可查看自製說明</span></div><div id="ruleFields" class="rule-fields"></div></div><div class="actions"><button class="btn" type="submit" data-i18n="createRoom">建立房間</button></div></form></section>
        <section class="panel card"><h3 data-i18n="enterByCode">使用房號進入</h3><form id="codeForm"><div class="fields"><div class="field"><label for="joinCode" data-i18n="roomCode">6 碼房號</label><input id="joinCode" maxlength="6" autocomplete="off" placeholder="ABC234"></div></div><div class="actions"><button class="btn secondary" type="submit" data-i18n="openRoom">開啟房間</button></div></form><div id="notice" class="notice" aria-live="polite"></div></section>
      </div>
      <section id="platformSetup" class="setup hidden" aria-live="polite"><strong data-i18n="multiplayerUnavailable">多人房間尚未啟用</strong><p>Cloudflare Durable Object binding：<code>ROOMS → GameRoom</code></p></section>
      <section class="game-catalog card"><div class="game-catalog-head"><div><div class="eyebrow">Games</div><h3 data-i18n="gamesVariants">棋類與變種</h3></div></div><div id="gameList" class="game-list"><article class="game-card"><strong>圍棋 9×9</strong><p>快速圍棋</p></article><article class="game-card"><strong>圍棋 13×13</strong><p>中型圍棋</p></article><article class="game-card"><strong>圍棋 19×19</strong><p>標準圍棋</p></article><article class="game-card"><strong>五子棋</strong><p>Gomoku</p></article><article class="game-card"><strong>連珠 Renju</strong><p>黑方禁手</p></article><article class="game-card"><strong>象棋</strong><p>中國象棋</p></article><article class="game-card"><strong>西洋棋</strong><p>Chess</p></article><article class="game-card"><strong>黑白棋 Reversi</strong><p>翻轉棋</p></article></div></section>
      <section class="rooms card"><div class="rooms-head"><div><div class="eyebrow">Public rooms</div><h3 data-i18n="publicRooms">公開房間</h3><div class="small muted" data-i18n="publicRoomsHint">只顯示最近 24 小時建立或活動過、且尚未結束的公開房</div></div><button id="refreshRooms" class="btn secondary" type="button" data-i18n="refresh">重新整理</button></div><div class="rooms-toolbar"><input id="roomSearch" class="room-search" type="search" autocomplete="off" placeholder="搜尋房名、房號或棋類" aria-label="搜尋公開房間"></div><div class="room-columns"><section class="room-column"><h4><span id="playingRoomsTitle">目前對局中</span><span id="playingRoomCount" class="room-count">0</span></h4><div id="playingRoomList" class="room-list muted" aria-live="polite"></div></section><section class="room-column"><h4><span id="waitingRoomsTitle">等待玩家</span><span id="waitingRoomCount" class="room-count">0</span></h4><div id="waitingRoomList" class="room-list muted" aria-live="polite"></div></section></div></section>
    </div>
  </main>

  <main id="roomGate" class="workspace hidden"><section class="room-gate card"><div class="gate-head"><div><div class="eyebrow">Room</div><h2 id="gateTitle" class="gate-title">Room</h2><div id="gateMeta" class="small muted"></div></div><div id="gateStatus" class="gate-status"></div></div><div class="fields" style="margin-top:16px"><div class="field"><label for="gateName" data-i18n="yourName">你的名稱</label><input id="gateName" maxlength="40" required placeholder="Ray"></div><div class="field"><label for="gatePassword" data-i18n="returnPassword">回場密碼（可不填）</label><input id="gatePassword" type="password" maxlength="128" autocomplete="current-password"></div></div><div class="role-actions"><button id="enterPlayer" class="role-choice" type="button"><strong data-i18n="joinPlayer">加入玩家</strong><span id="playerChoiceHint"></span></button><button id="enterSpectator" class="role-choice" type="button"><strong data-i18n="joinSpectator">加入觀戰</strong><span data-i18n="spectatorHint">觀眾使用獨立聊天室，玩家不會收到觀眾訊息。</span></button></div><div id="gateNotice" class="notice" aria-live="polite"></div><div class="gate-back"><button id="gateBack" class="btn ghost" type="button" data-i18n="backLobby">回公開大廳</button></div></section></main>

  <main id="room" class="workspace hidden">
    <div class="room-layout">
      <section class="room-main">
        <div class="room-header card"><div class="room-title"><div class="eyebrow">Live room</div><h2 id="roomTitle">棋局</h2><div id="roomMeta" class="room-meta"></div></div><div class="room-actions"><button id="copyLink" class="btn ghost" type="button" data-i18n="copyLink">複製房間連結</button><button id="leaveRoom" class="btn secondary" type="button" data-i18n="leave">離開</button></div></div>
        <div id="players" class="players"></div>
        <div class="board-card card"><div id="boardStage" class="board-stage"><div id="boardFit" class="board-fit"><div id="board" class="board" aria-label="Board"></div></div></div></div>
      </section>
      <aside class="side-stack">
        <section class="status-card card"><div id="turnInfo" class="turn-banner"></div><div id="roleInfo" class="role-line"></div><label id="lastMoveMarkerSetting" class="last-move-setting hidden"><input id="lastMoveMarkerToggle" type="checkbox" checked><span id="lastMoveMarkerLabel">上一手標記</span></label><div id="goEstimate" class="go-estimate hidden"></div><div id="resultBanner" class="result-banner hidden"><div id="resultTitle" class="result-title"></div><div id="resultReason" class="result-reason"></div></div><div class="actions"><button id="passBtn" class="btn secondary hidden" type="button" data-i18n="pass">虛手 Pass</button><button id="swapBtn" class="btn secondary hidden" type="button" data-i18n="swapSides">交換持色</button><button id="resignBtn" class="btn danger" type="button" data-i18n="resign">認輸</button><button id="rematchBtn" class="btn secondary hidden" type="button" data-i18n="rematch">要求再戰</button></div></section>
        <section id="replayCard" class="replay-card card status-card"><div class="queue-head"><div><strong data-i18n="replayTitle">對局回放</strong><div class="small muted" data-i18n="replayHint">完成的對局會保留最近 12 局</div></div><button class="collapse-btn" type="button" data-collapse="replayBody">⌄</button></div><div id="replayBody" class="collapsed-body"><div id="replayList" class="replay-list"></div></div></section>
        <section id="pendingBox" class="pending hidden"><strong data-i18n="joinRequests">加入申請</strong><div id="pendingList"></div></section>
        <section class="queue-card card"><div class="queue-head"><div><strong data-i18n="queue">排隊</strong><div id="queueMeta" class="small muted"></div></div><button class="collapse-btn" type="button" data-collapse="queueBody">⌄</button></div><div id="queueBody" class="collapsed-body"><div id="hostQueueSettings" class="queue-settings hidden"><label class="setting-check"><input id="queueEnabledRoom" type="checkbox"><span data-i18n="enabled">啟用</span></label><select id="rotationRoom"><option value="winner_stays" data-i18n="winnerStays">勝者留桌</option><option value="rotate_both" data-i18n="rotateBoth">雙方輪替</option><option value="host_stays">房主留桌</option></select></div><div id="queueList"></div></div></section>
        <section class="chat-card card"><div class="chat-head"><div><strong id="chatTitle" data-i18n="chat">聊天室</strong><div id="chatHint" class="small muted"></div></div><button class="collapse-btn" type="button" data-collapse="chatBody">⌄</button></div><div id="chatBody" class="collapsed-body"><div id="chatList" class="chat-list" aria-live="polite"></div><form id="chatForm" class="chat-form"><input id="chatInput" maxlength="300" autocomplete="off" placeholder="..."><button id="chatSend" class="btn" type="submit" data-i18n="send">傳送</button></form></div></section>
        <section class="rules-card card"><div class="collapse-head"><div><div class="eyebrow">Rules</div><strong data-i18n="roomRules">本局規則</strong></div><button class="collapse-btn" type="button" data-collapse="rulesBody">⌄</button></div><div id="rulesBody" class="collapsed-body"><p id="ruleInfo" class="rules-text"></p><div id="roomRuleList"></div></div></section>
        <div id="roomNotice" class="room-notice" aria-live="polite"></div>
      </aside>
    </div>
  </main>
</div>

<div id="modalOverlay" class="overlay hidden" role="presentation"><section id="modalCard" class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><h3 id="modalTitle"></h3><div id="modalBody"></div><div class="dialog-actions"><button id="modalCancel" class="btn ghost" type="button"></button><button id="modalConfirm" class="btn" type="button"></button></div></section></div>
<div id="replayOverlay" class="overlay hidden" role="presentation"><section class="dialog-card replay-dialog" role="dialog" aria-modal="true" aria-labelledby="replayTitle"><div class="collapse-head"><div><div class="eyebrow">Replay</div><h3 id="replayTitle" data-i18n="replayTitle">對局回放</h3></div><button id="replayClose" class="collapse-btn" type="button" aria-label="Close">×</button></div><div class="replay-layout"><div class="replay-stage"><div id="replayBoard" class="board" aria-label="Replay board"></div></div><div class="replay-side"><strong id="replayMatchTitle"></strong><p id="replayMeta" class="small muted"></p><p id="replayResult" class="rules-text"></p><div class="replay-controls"><button id="replayPrev" class="btn ghost" type="button" data-i18n="previous">上一手</button><input id="replayRange" type="range" min="0" max="0" value="0" aria-label="Replay step"><button id="replayNext" class="btn ghost" type="button" data-i18n="next">下一手</button></div><div id="replayStep" class="replay-step"></div></div></div></section></div>
<div id="helpPopover" class="popover hidden" role="dialog" aria-modal="false"><div class="collapse-head"><h4 id="helpTitle"></h4><button id="helpClose" class="collapse-btn" type="button">×</button></div><p id="helpBody"></p></div>
<div id="toastStack" class="toast-stack" aria-live="polite"></div>

<script>
(function(){
"use strict";
var SERVER_GAMES=__CLIENT_GAMES__;
var SERVER_RULES=__CLIENT_RULE_DEFS__;
var GAMES={
  go9:{zhHant:["圍棋 9×9","快速圍棋"],zhHans:["围棋 9×9","快速围棋"],en:["Go 9×9","Fast Go"]},
  go13:{zhHant:["圍棋 13×13","中型圍棋"],zhHans:["围棋 13×13","中型围棋"],en:["Go 13×13","Medium Go"]},
  go19:{zhHant:["圍棋 19×19","標準圍棋"],zhHans:["围棋 19×19","标准围棋"],en:["Go 19×19","Standard Go"]},
  gomoku:{zhHant:["五子棋","Gomoku"],zhHans:["五子棋","Gomoku"],en:["Gomoku","Five in a Row"]},
  renju:{zhHant:["連珠 Renju","五子棋競技變種 · 黑方禁手"],zhHans:["连珠 Renju","五子棋竞技变种 · 黑方禁手"],en:["Renju","Competitive Gomoku variant · forbidden moves for Black"]},
  xiangqi:{zhHant:["象棋","中國象棋"],zhHans:["象棋","中国象棋"],en:["Xiangqi","Chinese Chess"]},
  chess:{zhHant:["西洋棋","Chess"],zhHans:["国际象棋","Chess"],en:["Chess","Western Chess"]},
  reversi:{zhHant:["黑白棋 Reversi","翻轉棋"],zhHans:["黑白棋 Reversi","翻转棋"],en:["Reversi","Othello-style"]}
};
var I18N={
zhHant:{brandSub:"多人棋室 · 即時對局 · 觀戰與排隊",sound:"音效",notifications:"通知",heroTitle:"一個房間，認真下完一盤。",heroText:"支援玩家、觀戰、私人房審核、排隊輪替與獨立觀眾聊天室；棋局狀態與勝負由伺服器判定。",pillSpectate:"觀戰",pillQueue:"排隊制",pillResult:"勝敗明確",createRoom:"建立房間",yourName:"你的名稱",returnPassword:"回場密碼（可不填）",roomName:"房間名稱",game:"棋類",privateRoom:"私人房：玩家入席需房主核准；知道房號者可選觀戰",queueMode:"開啟排隊制",rotation:"輪替方式",winnerStays:"勝者留桌",rotateBoth:"雙方輪替",ruleSettings:"規則設定",ruleSettingsHint:"每一項 ! 都可查看自製說明",enterByCode:"使用房號進入",roomCode:"6 碼房號",openRoom:"開啟房間",multiplayerUnavailable:"多人房間尚未啟用",gamesVariants:"棋類與變種",publicRooms:"公開房間",publicRoomsHint:"只顯示最近 24 小時建立或活動過、且尚未結束的公開房",refresh:"重新整理",joinPlayer:"加入玩家",joinSpectator:"加入觀戰",spectatorHint:"觀眾使用獨立聊天室，玩家不會收到觀眾訊息。",backLobby:"回公開大廳",copyLink:"複製房間連結",leave:"離開",pass:"虛手 Pass",swapSides:"交換持色",resign:"認輸",rematch:"要求再戰",joinRequests:"加入申請",queue:"排隊",enabled:"啟用",chat:"聊天室",send:"傳送",roomRules:"本局規則",waiting:"等待玩家",playing:"對局中",finished:"已結束",playerA:"玩家 A",playerB:"玩家 B",emptySeat:"空位",online:"在線",offline:"離線",approve:"核准",reject:"拒絕",queued:"排隊中",spectator:"觀眾",host:"房主",player:"玩家",pending:"等待房主核准",turn:"輪到",win:"你贏了",loss:"你輸了",draw:"和棋",roomEnded:"棋局結束",playersChat:"玩家聊天室",spectatorChat:"觀眾聊天室",noMessages:"還沒有訊息。",pendingChat:"核准後才能聊天。",queueEmpty:"目前沒有人排隊。",spectators:"觀眾",open:"進入房間",queueJoin:"加入排隊",playerFull:"玩家已滿（未開排隊）",requestSeat:"申請玩家席位",joinSeat:"加入玩家席位",copyDone:"房間連結已複製。",copyFailed:"無法存取剪貼簿，已顯示可手動複製的連結。",confirmResign:"確定要認輸嗎？此局會立即判負。",confirm:"確定",cancel:"取消",notifyEnabled:"通知已啟用。",notifyFallback:"通知不可用；輪到你時會改用提示音。",yourTurn:"輪到你上場",queueTurnBody:"排隊已輪到你，請回到房間開始下一局。",roomNotFound:"找不到房間。",loading:"讀取中…",noPublicRooms:"目前沒有可加入的公開房間。",entering:"進入中…",creating:"建立中…",rules:"規則",activity:"活動",queueCount:"排隊",spectatorCount:"觀眾",moveUp:"往前",moveDown:"往後",replayTitle:"對局回放",replayHint:"完成的對局會保留最近 12 局",replay:"回放",noReplays:"還沒有完成的對局可回放。",previous:"上一手",next:"下一手",replayStep:"步數"},
zhHans:{brandSub:"多人棋室 · 实时对局 · 观战与排队",sound:"音效",notifications:"通知",heroTitle:"一个房间，认真下完一盘。",heroText:"支持玩家、观战、私人房审核、排队轮换与独立观众聊天室；棋局状态与胜负由服务器判定。",pillSpectate:"观战",pillQueue:"排队制",pillResult:"胜负明确",createRoom:"创建房间",yourName:"你的名称",returnPassword:"回场密码（可不填）",roomName:"房间名称",game:"棋类",privateRoom:"私人房：玩家入席需房主批准；知道房号者可选择观战",queueMode:"开启排队制",rotation:"轮换方式",winnerStays:"胜者留桌",rotateBoth:"双方轮换",ruleSettings:"规则设置",ruleSettingsHint:"每一项 ! 都可查看自制说明",enterByCode:"使用房号进入",roomCode:"6 位房号",openRoom:"打开房间",multiplayerUnavailable:"多人房间尚未启用",gamesVariants:"棋类与变种",publicRooms:"公开房间",publicRoomsHint:"只显示最近 24 小时创建或活动过、且尚未结束的公开房",refresh:"刷新",joinPlayer:"加入玩家",joinSpectator:"加入观战",spectatorHint:"观众使用独立聊天室，玩家不会收到观众消息。",backLobby:"回公开大厅",copyLink:"复制房间链接",leave:"离开",pass:"虚手 Pass",swapSides:"交换持色",resign:"认输",rematch:"要求再战",joinRequests:"加入申请",queue:"排队",enabled:"启用",chat:"聊天室",send:"发送",roomRules:"本局规则",waiting:"等待玩家",playing:"对局中",finished:"已结束",playerA:"玩家 A",playerB:"玩家 B",emptySeat:"空位",online:"在线",offline:"离线",approve:"批准",reject:"拒绝",queued:"排队中",spectator:"观众",host:"房主",player:"玩家",pending:"等待房主批准",turn:"轮到",win:"你赢了",loss:"你输了",draw:"和棋",roomEnded:"棋局结束",playersChat:"玩家聊天室",spectatorChat:"观众聊天室",noMessages:"还没有消息。",pendingChat:"批准后才能聊天。",queueEmpty:"目前没有人排队。",spectators:"观众",open:"进入房间",queueJoin:"加入排队",playerFull:"玩家已满（未开排队）",requestSeat:"申请玩家席位",joinSeat:"加入玩家席位",copyDone:"房间链接已复制。",copyFailed:"无法访问剪贴板，已显示可手动复制的链接。",confirmResign:"确定要认输吗？本局会立即判负。",confirm:"确定",cancel:"取消",notifyEnabled:"通知已启用。",notifyFallback:"通知不可用；轮到你时会改用提示音。",yourTurn:"轮到你上场",queueTurnBody:"排队已轮到你，请回到房间开始下一局。",roomNotFound:"找不到房间。",loading:"读取中…",noPublicRooms:"目前没有可加入的公开房间。",entering:"进入中…",creating:"创建中…",rules:"规则",activity:"活动",queueCount:"排队",spectatorCount:"观众",moveUp:"往前",moveDown:"往后",replayTitle:"对局回放",replayHint:"已完成的对局会保留最近 12 局",replay:"回放",noReplays:"还没有完成的对局可回放。",previous:"上一手",next:"下一手",replayStep:"步数"},
en:{brandSub:"Multiplayer board room · Live play · Spectating & queue",sound:"Sound",notifications:"Notifications",heroTitle:"One room. Finish the match properly.",heroText:"Players, spectators, private-room approval, queue rotation and a spectator-only chat. Game legality and results are server-authoritative.",pillSpectate:"Spectate",pillQueue:"Queue",pillResult:"Clear results",createRoom:"Create room",yourName:"Your name",returnPassword:"Return password (optional)",roomName:"Room name",game:"Game",privateRoom:"Private room: player seats need host approval; anyone with the code may choose Spectator",queueMode:"Enable queue",rotation:"Rotation",winnerStays:"Winner stays",rotateBoth:"Rotate both",ruleSettings:"Rule settings",ruleSettingsHint:"Every ! opens a custom explanation",enterByCode:"Enter with room code",roomCode:"6-character code",openRoom:"Open room",multiplayerUnavailable:"Multiplayer is not enabled",gamesVariants:"Games & variants",publicRooms:"Public rooms",publicRoomsHint:"Only public rooms created or active in the last 24 hours and not finished",refresh:"Refresh",joinPlayer:"Join as player",joinSpectator:"Join as spectator",spectatorHint:"Spectators have a separate chat channel that players never receive.",backLobby:"Back to lobby",copyLink:"Copy room link",leave:"Leave",pass:"Pass",swapSides:"Swap sides",resign:"Resign",rematch:"Request rematch",joinRequests:"Join requests",queue:"Queue",enabled:"Enabled",chat:"Chat",send:"Send",roomRules:"Room rules",waiting:"Waiting",playing:"Playing",finished:"Finished",playerA:"Player A",playerB:"Player B",emptySeat:"empty seat",online:"online",offline:"offline",approve:"Approve",reject:"Reject",queued:"queued",spectator:"spectator",host:"host",player:"player",pending:"waiting for host approval",turn:"Turn",win:"You won",loss:"You lost",draw:"Draw",roomEnded:"Match finished",playersChat:"Player chat",spectatorChat:"Spectator chat",noMessages:"No messages yet.",pendingChat:"Chat unlocks after approval.",queueEmpty:"Nobody is queued.",spectators:"Spectators",open:"Enter room",queueJoin:"Join queue",playerFull:"Player seats full (queue disabled)",requestSeat:"Request player seat",joinSeat:"Join player seat",copyDone:"Room link copied.",copyFailed:"Clipboard unavailable. The link is shown for manual copy.",confirmResign:"Resign now? This immediately loses the current match.",confirm:"Confirm",cancel:"Cancel",notifyEnabled:"Notifications enabled.",notifyFallback:"Notifications unavailable; queue turns will use a sound instead.",yourTurn:"Your queue turn",queueTurnBody:"You have been promoted from the queue. Return to the room for the next match.",roomNotFound:"Room not found.",loading:"Loading…",noPublicRooms:"No public rooms are currently available.",entering:"Entering…",creating:"Creating…",rules:"Rules",activity:"Activity",queueCount:"Queue",spectatorCount:"Spectators",moveUp:"Up",moveDown:"Down",replayTitle:"Match replay",replayHint:"The latest 12 completed matches are retained",replay:"Replay",noReplays:"No completed match is available for replay yet.",previous:"Previous",next:"Next",replayStep:"Step"}
};
var HELP={
  name:{zhHant:["名稱","同一房間內，玩家、觀眾、排隊與待審核者都不可重名；伺服器會做 Unicode NFKC 與大小寫正規化後比對。"],zhHans:["名称","同一房间内，玩家、观众、排队与待审核者都不可重名；服务器会进行 Unicode NFKC 与大小写规范化后比较。"],en:["Name","Names are unique across players, spectators, queue and pending members after Unicode NFKC and case normalization."]},
  password:{zhHant:["回場密碼","可不填。若設定，伺服器只保存加鹽 PBKDF2 衍生值，不保存或廣播明文；遺失瀏覽器 token 時可用同名＋密碼取回原身份。"],zhHans:["回场密码","可不填。若设置，服务器只保存加盐 PBKDF2 派生值，不保存或广播明文；丢失浏览器 token 后可用同名＋密码取回原身份。"],en:["Return password","Optional. The server stores only a salted PBKDF2-derived value, never the plaintext. It can reclaim the same identity if the browser token is lost."]},
  game:{zhHant:["棋類","每種棋使用獨立盤面與伺服器規則引擎；只會提供已實際 enforce 的變種。"],zhHans:["棋类","每种棋使用独立棋盘与服务器规则引擎；只提供服务器实际执行的变种。"],en:["Game","Each game has its own renderer and server rule engine. Only variants that are actually enforced are selectable."]},
  queue:{zhHant:["排隊制","玩家席位已滿時，新玩家直接進入排隊。房主可調整順序；比賽結束後依輪替方式把離桌玩家移至觀眾席，再自動補入下一位。"],zhHans:["排队制","玩家席位已满时，新玩家直接进入排队。房主可调整顺序；比赛结束后按轮换方式把离桌玩家移至观众席，再自动补入下一位。"],en:["Queue","When both seats are full, new players enter the queue. The host can reorder it; after a match, rotated players become spectators and queued members are promoted automatically."]},
  rotation:{zhHant:["輪替方式","勝者留桌：有勝負時敗者轉觀眾、下一位補上；和棋雙方輪替。雙方輪替：每局結束兩位玩家都轉觀眾，再依排隊順序補位。"],zhHans:["轮换方式","胜者留桌：有胜负时败者转观众、下一位补上；和棋双方轮换。双方轮换：每局结束两位玩家都转观众，再按排队顺序补位。"],en:["Rotation","Winner stays: the loser becomes a spectator and the next queued member joins; draws rotate both. Rotate both: both players become spectators after every match."]}
};
var RULE_OPTION_I18N={
  go:{
    ruleset:{chinese:["中國規則","中国规则","Chinese"],japanese:["日本規則","日本规则","Japanese"],aga:["AGA 規則","AGA 规则","AGA"],newzealand:["紐西蘭規則","新西兰规则","New Zealand"]},
    scoring:{area:["Area 面積計分","Area 面积计分","Area scoring"],territory:["Territory 地計分","Territory 地计分","Territory scoring"]},
    koRule:{simple:["Simple Ko 簡單劫","Simple Ko 简单劫","Simple ko"],superko:["Positional Superko 盤面超劫","Positional Superko 局面超劫","Positional superko"]},
    mode:{standard:["標準圍棋","标准围棋","Standard Go"],capture:["Capture Go 吃子棋","Capture Go 吃子棋","Capture Go"]}
  },
  gomoku:{
    variant:{freestyle:["Freestyle 五子以上","Freestyle 五子以上","Freestyle (5+)"],exact5:["Exact-Five 精確五連","Exact-Five 精确五连","Exact five"],connect6:["Connect6 六子棋","Connect6 六子棋","Connect6"]},
    opening:{none:["無限制","无限制","None"],pro:["Pro 開局","Pro 开局","Pro opening"],swap:["Swap 交換持色","Swap 交换持色","Swap"]}
  },
  renju:{opening:{free:["自由開局","自由开局","Free opening"]}},
  chess:{variant:{standard:["標準西洋棋","标准国际象棋","Standard chess"],threecheck:["Three-Check 三將棋","Three-Check 三将棋","Three-Check"],koth:["King of the Hill 王者登峰","King of the Hill 王者登峰","King of the Hill"]}},
  reversi:{objective:{normal:["標準：棋子多者勝","标准：棋子多者胜","Normal: more discs wins"],misere:["Anti-Othello：棋子少者勝","Anti-Othello：棋子少者胜","Misère: fewer discs wins"]}}
};
var RULE_HELP_I18N={
  "go.ruleset":["選擇常見規則集預設；房主仍可調整計分、劫、自殺與貼目。","选择常见规则集预设；房主仍可调整计分、劫、自杀与贴目。","Choose a common ruleset preset; scoring, ko, suicide and komi remain configurable."],
  "go.scoring":["面積計分主要計活棋＋領地；地計分主要計領地＋提子。本版不做終局死子協商。","面积计分主要算活棋＋领地；地计分主要算领地＋提子。本版不做终局死子协商。","Area scoring counts stones plus territory; territory scoring counts territory plus captures. Dead-stone negotiation is not implemented."],
  "go.komi":["白棋後手補償，可設定 0～20，0.5 為步進。","白棋后手补偿，可设置 0～20，步进 0.5。","Compensation for White moving second; 0–20 in 0.5 steps."],
  "go.koRule":["簡單劫只禁止立即回復上一盤面；盤面超劫禁止重現本局任何先前盤面。","简单劫只禁止立即恢复上一局面；局面超劫禁止重现本局任何先前局面。","Simple ko blocks only the immediate repetition; positional superko blocks any previous board position."],
  "go.suicide":["關閉時禁止自殺著；開啟後無氣的己方棋串會依設定移除。","关闭时禁止自杀着；开启后无气的己方棋串会按设置移除。","When enabled, a no-liberty self-group may be removed instead of making the move illegal."],
  "go.mode":["標準圍棋以雙方 Pass 後計分；Capture Go 達到提子目標立即獲勝。","标准围棋在双方 Pass 后计分；Capture Go 达到提子目标立即获胜。","Standard Go scores after two passes; Capture Go ends immediately at the configured capture target."],
  "go.captureGoal":["Capture Go 先累積提掉指定數量敵子者勝。","Capture Go 先累计提掉指定数量敌子者胜。","First player to capture this many opposing stones wins Capture Go."],
  "go.handicap":["2～9 子會預先放置黑子並由白先；0 為一般分先。","2～9 子会预先放置黑子并由白先；0 为普通分先。","Handicap 2–9 pre-places Black stones and gives White the first move; 0 is even play."],
  "gomoku.variant":["Freestyle 五子以上皆勝；Exact-Five 必須剛好五子；Connect6 以六連為目標且第一手後每回合兩子。","Freestyle 五子以上皆胜；Exact-Five 必须正好五子；Connect6 以六连为目标且第一手后每回合两子。","Freestyle wins with 5+; Exact-Five requires exactly five; Connect6 targets six and uses two stones per turn after the opening move."],
  "gomoku.boardSize":["可選 15×15 或 19×19，規則引擎會依實際尺寸判定。","可选 15×15 或 19×19，规则引擎按实际尺寸判定。","Choose 15×15 or 19×19; legality and win checks use the selected size."],
  "gomoku.opening":["Pro 限制黑方早期落點；Swap 在第一手後允許玩家 B 交換持色。","Pro 限制黑方早期落点；Swap 在第一手后允许玩家 B 交换持色。","Pro restricts early Black placements; Swap lets Player B exchange colors after the first move."],
  "renju.opening":["目前只開放伺服器可完整執行的自由開局；黑方禁手仍有效。","目前只开放服务器可完整执行的自由开局；黑方禁手仍有效。","Only the fully enforced free opening is selectable; Black forbidden-move rules still apply."],
  "xiangqi.stalemateLoss":["開啟時無合法著法判負；關閉時若未被將軍則判和。","开启时无合法着法判负；关闭时若未被将军则判和。","When enabled, having no legal move loses; when disabled, a non-check stalemate is a draw."],
  "chess.variant":["標準、Three-Check（三次將軍勝）與 King of the Hill（王進中央四格勝）皆由伺服器判定。","标准、Three-Check（三次将军胜）与 King of the Hill（王进入中央四格胜）均由服务器判定。","Standard, Three-Check (three checks wins), and King of the Hill (king reaches the center) are server-enforced."],
  "chess.threefold":["同一局面第三次出現時自動判和。","同一局面第三次出现时自动判和。","Automatically draws on the third occurrence of the same position."],
  "chess.fiftyMove":["連續 100 ply 沒有兵移動或吃子時自動判和。","连续 100 ply 没有兵移动或吃子时自动判和。","Automatically draws after 100 plies without a pawn move or capture."],
  "chess.insufficient":["自動判定基本子力不足死局，例如 K vs K、K+B vs K、K+N vs K。","自动判定基本子力不足死局，例如 K vs K、K+B vs K、K+N vs K。","Automatically detects basic insufficient-material dead positions such as K vs K, K+B vs K, and K+N vs K."],
  "reversi.boardSize":["6×6、8×8、10×10 使用相同翻子規則，僅改變棋盤大小。","6×6、8×8、10×10 使用相同翻子规则，仅改变棋盘大小。","6×6, 8×8, and 10×10 use the same flipping rules with different board sizes."],
  "reversi.objective":["標準模式終局棋子多者勝；Misère 模式反過來，棋子少者勝。","标准模式终局棋子多者胜；Misère 模式相反，棋子少者胜。","Normal mode rewards more discs; Misère reverses the objective so fewer discs wins." ]
};
function langIndex(){return lang==="en"?2:lang==="zh-Hans"?1:0}
function optionTranslation(family,key,value,fallback){var hit=RULE_OPTION_I18N[family]&&RULE_OPTION_I18N[family][key]&&RULE_OPTION_I18N[family][key][String(value)];return hit?hit[langIndex()]:fallback}
function ruleHelpText(family,key,fallback){var hit=RULE_HELP_I18N[family+"."+key];return hit?hit[langIndex()]:(lang==="zh-Hans"?String(fallback||"").replace(/規則/g,"规则").replace(/棋盤/g,"棋盘").replace(/開啟/g,"开启").replace(/關閉/g,"关闭").replace(/計分/g,"计分"):String(fallback||""))}
function ruleValueText(family,field,value){if(field&&field.options){var found=field.options.find(function(o){return String(o[0])===String(value)});if(found)return optionTranslation(family,field.key,value,String(found[1]))}if(typeof value==='boolean')return value?(lang==='en'?'On':lang==='zh-Hans'?'开':'開'):(lang==='en'?'Off':lang==='zh-Hans'?'关':'關');return String(value)}
function localizedRulesSummary(gameId,rules,defs){var family=defs&&defs.family||(SERVER_GAMES[gameId]&&SERVER_GAMES[gameId].family)||'';var fields=defs&&defs.fields||(SERVER_RULES[family]&&SERVER_RULES[family].fields)||[];return fields.filter(function(f){if(!f.when)return true;var k=Object.keys(f.when)[0];return String(rules[k])===String(f.when[k])}).map(function(f){return fieldTranslation(family,f.key,'label',f.label)+': '+ruleValueText(family,f,rules[f.key])}).join(' · ')}
var lang=localStorage.getItem("boardverseLang")||"zh-Hant";if(!["zh-Hant","zh-Hans","en"].includes(lang))lang="zh-Hant";
var session=null,ws=null,roomState=null,selected=null,lastChatId=0,lastMoveKey="",gateCode="",gateInfo=null,modalConfirmAction=null,audioCtx=null,swReg=null,replayData=null,replayIndex=0,publicRoomsCache=[];
try{session=JSON.parse(localStorage.getItem("boardverseSession")||"null")}catch(e){}
function $(id){return document.getElementById(id)}
function normalizePageTheme(v){v=String(v||'').toLowerCase();if(v==='white'||v==='#fff'||v==='#ffffff')return 'white';if(v==='black'||v==='#000'||v==='#000000')return 'black';if(/^#[0-9a-f]{6}$/.test(v)){var n=parseInt(v.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;return (r*299+g*587+b*114)/1000>=160?'white':'black'}return 'black'}
function applyPageTheme(value){var v=normalizePageTheme(value);document.body.classList.remove('custom-board-bg','page-theme-black','page-theme-white');['--board-bg','--board-bg-light','--board-bg-dark'].forEach(function(k){document.documentElement.style.removeProperty(k)});document.body.style.removeProperty('background');document.body.classList.add('page-theme-'+v);var black=$('pageBgBlack'),white=$('pageBgWhite');if(black)black.setAttribute('aria-checked',v==='black'?'true':'false');if(white)white.setAttribute('aria-checked',v==='white'?'true':'false');var meta=document.querySelector('meta[name=theme-color]');if(meta)meta.setAttribute('content',v==='white'?'#f7f4ec':'#11100d');return v}
function refreshPageBgLabels(){var label=lang==='en'?'Page background':lang==='zh-Hans'?'页面背景':'頁面背景',black=lang==='en'?'Black':lang==='zh-Hans'?'黑':'黑',white=lang==='en'?'White':lang==='zh-Hans'?'白':'白';$('pageBgLabel').textContent=label;$('pageThemeChoice').setAttribute('aria-label',label);$('pageBgBlack').textContent=black;$('pageBgWhite').textContent=white}
function localeKey(){return lang==="zh-Hant"?"zhHant":lang==="zh-Hans"?"zhHans":"en"}
function t(key){var dict=I18N[localeKey()]||I18N.zhHant;return dict[key]||I18N.zhHant[key]||key}
function gameText(id,index){var key=lang==="zh-Hans"?"zhHans":lang==="en"?"en":"zhHant";return GAMES[id]&&GAMES[id][key]?GAMES[id][key][index||0]:(SERVER_GAMES[id]?SERVER_GAMES[id].title:id)}
function queuePolicyText(v){if(v==='host_stays')return lang==='en'?'Host stays':lang==='zh-Hans'?'房主留桌':'房主留桌';return v}
function refreshQueuePolicyLabels(){document.querySelectorAll('option[value="host_stays"]').forEach(function(o){o.textContent=queuePolicyText('host_stays')})}
function ruleDetailsLabel(){return lang==='en'?'Learn rule settings':lang==='zh-Hans'?'详细了解规则设置':'詳細了解規則設定'}
function applyLanguage(){document.documentElement.lang=lang==="zh-Hans"?"zh-Hans-CN":lang==="en"?"en":"zh-Hant-TW";$('languageSelect').value=lang;document.querySelectorAll('[data-i18n]').forEach(function(el){var v=t(el.getAttribute('data-i18n'));if(el.tagName==='OPTION')el.textContent=v;else el.textContent=v});if($('roomSearch')){$('roomSearch').placeholder=lang==='en'?'Search room name, code or game':lang==='zh-Hans'?'搜索房名、房号或棋类':'搜尋房名、房號或棋類';$('roomSearch').setAttribute('aria-label',lang==='en'?'Search public rooms':lang==='zh-Hans'?'搜索公开房间':'搜尋公開房間')}$('playingRoomsTitle').textContent=lang==='en'?'Playing now':lang==='zh-Hans'?'目前对局中':'目前對局中';$('waitingRoomsTitle').textContent=lang==='en'?'Waiting for players':lang==='zh-Hans'?'等待玩家':'等待玩家';refreshQueuePolicyLabels();renderGameCatalog();renderRuleFields();if(roomState)renderRoom();if(gateInfo)renderGate(gateInfo);if(publicRoomsCache.length)renderPublicRooms(publicRoomsCache);else refreshRooms()}
function setNotice(text,bad){$('notice').textContent=text||'';$('notice').className='notice'+(bad?' err':'')}
function setGateNotice(text,bad){$('gateNotice').textContent=text||'';$('gateNotice').className='notice'+(bad?' err':'')}
function setRoomNotice(text,bad){$('roomNotice').textContent=text||'';$('roomNotice').className='room-notice'+(bad?' err':'')}
function toast(text,kind){var el=document.createElement('div');el.className='toast'+(kind?' '+kind:'');el.textContent=text;$('toastStack').appendChild(el);setTimeout(function(){el.remove()},4200)}
function openModal(title,body,options){options=options||{};$('modalTitle').textContent=title;$('modalBody').textContent='';if(options.node)$('modalBody').appendChild(options.node);else{var p=document.createElement('p');p.textContent=body||'';$('modalBody').appendChild(p)};$('modalCancel').textContent=options.cancelText||t('cancel');$('modalConfirm').textContent=options.confirmText||t('confirm');$('modalCancel').classList.toggle('hidden',options.cancel===false);modalConfirmAction=typeof options.onConfirm==='function'?options.onConfirm:null;$('modalOverlay').classList.remove('hidden');$('modalConfirm').focus()}
function closeModal(){$('modalOverlay').classList.add('hidden');modalConfirmAction=null}
function openHelp(target,title,body){$('helpTitle').textContent=title;$('helpBody').textContent=body;var pop=$('helpPopover');pop.classList.remove('hidden');var r=target.getBoundingClientRect(),w=Math.min(360,window.innerWidth-24);var left=Math.min(window.innerWidth-w-12,Math.max(12,r.left));var top=r.bottom+8;if(top+260>window.innerHeight)top=Math.max(12,r.top-250);pop.style.left=left+'px';pop.style.top=top+'px'}
function closeHelp(){$('helpPopover').classList.add('hidden')}
function api(path,opt){return fetch(path,opt).then(function(r){return r.json().catch(function(){return {message:'Invalid response'}}).then(function(d){if(!r.ok){var e=new Error(d.message||'Request failed');e.code=d.error||'';e.status=r.status;throw e}return d})})}
function statusText(s){return s==='waiting'?t('waiting'):s==='playing'?t('playing'):t('finished')}
function sideName(gameId,s){if(gameId==='chess')return s==='W'?(lang==='en'?'White':lang==='zh-Hans'?'白方':'白方'):(lang==='en'?'Black':'黑方');if(gameId==='xiangqi')return s==='R'?(lang==='en'?'Red':lang==='zh-Hans'?'红方':'紅方'):(lang==='en'?'Black':'黑方');return s==='B'?(lang==='en'?'Black':'黑方'):(lang==='en'?'White':'白方')}
function roomPath(code){return '/'+String(code||'').toUpperCase()}
var PUBLIC_ROOM_ORIGIN='https://xn--gmqt6w03b11v.ray2025.com';
function roomUrl(code){return PUBLIC_ROOM_ORIGIN+roomPath(code)}
function pathCode(){var m=location.pathname.match(/^\/([A-Z2-9]{6})\/?$/);return m?m[1]:''}
function showView(which){['lobby','roomGate','room'].forEach(function(id){$(id).classList.toggle('hidden',id!==which)});document.body.classList.toggle('room-mode',which==='room')}
function saveSession(d,name){session={roomId:d.roomId,token:d.token,role:d.role,name:name||'',memberId:d.memberId||null};localStorage.setItem('boardverseSession',JSON.stringify(session));history.replaceState(null,'',roomPath(d.roomId));connectRoom()}
function leave(){session=null;roomState=null;selected=null;lastChatId=0;lastMoveKey='';localStorage.removeItem('boardverseSession');if(ws){try{ws.close()}catch(e){}ws=null}history.pushState(null,'','/');showView('lobby');gateCode='';gateInfo=null;refreshRooms()}
function cleanCode(v){return String(v||'').toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6)}
var ruleDrafts=window.__boardverseRuleDrafts||(window.__boardverseRuleDrafts={});
function ruleControlValue(f,el){if(f.type==='checkbox')return !!el.checked;if(f.type==='number')return Number(el.value);return el.value}
function formRules(){var gameId=$('gameId').value,family=SERVER_GAMES[gameId].family,def=SERVER_RULES[family],out={};if(!def)return out;def.fields.forEach(function(f){var el=document.querySelector('[data-rule-key="'+f.key+'"]');if(!el)return;out[f.key]=ruleControlValue(f,el)});ruleDrafts[gameId]=Object.assign({},ruleDrafts[gameId]||{},out);return out}
function fieldTranslation(family,key,kind,fallback){var map={
  go:{ruleset:['規則集','规则集','Ruleset'],scoring:['終局計分','终局计分','Scoring'],komi:['貼目 Komi','贴目 Komi','Komi'],koRule:['劫規則','劫规则','Ko rule'],suicide:['允許自殺著','允许自杀着','Allow suicide'],mode:['對局模式','对局模式','Mode'],captureGoal:['吃子棋目標','吃子棋目标','Capture target'],handicap:['讓子','让子','Handicap']},
  gomoku:{variant:['勝利規則','胜利规则','Win rule'],boardSize:['棋盤大小','棋盘大小','Board size'],opening:['開局平衡','开局平衡','Opening balance']},
  renju:{opening:['開局規則','开局规则','Opening rule']},xiangqi:{stalemateLoss:['困斃判負','困毙判负','Stalemate loses']},
  chess:{variant:['對局變種','对局变种','Variant'],threefold:['三次重複可和棋','三次重复可和棋','Threefold draw'],fiftyMove:['50-move Rule','50-move Rule','50-move rule'],insufficient:['子力不足自動和棋','子力不足自动和棋','Insufficient material draw']},
  reversi:{boardSize:['棋盤大小','棋盘大小','Board size'],objective:['勝利條件','胜利条件','Objective']}
};var a=map[family]&&map[family][key];if(!a)return fallback;return lang==='en'?a[2]:lang==='zh-Hans'?a[1]:a[0]}
function helpTranslation(family,key,fallback){return ruleHelpText(family,key,fallback)}
function goOptionDetail(key,value){var z=lang==='en'?2:lang==='zh-Hans'?1:0,m={ruleset:{chinese:['BoardVerse 預設：Area 面積計分、Komi 7.5、Simple Ko、禁止自殺著。','BoardVerse 默认：Area 面积计分、Komi 7.5、Simple Ko、禁止自杀着。','BoardVerse preset: Area scoring, komi 7.5, Simple Ko, suicide off.'],japanese:['BoardVerse 預設：Territory 地計分、Komi 6.5、Simple Ko、禁止自殺著。','BoardVerse 默认：Territory 地计分、Komi 6.5、Simple Ko、禁止自杀着。','BoardVerse preset: Territory scoring, komi 6.5, Simple Ko, suicide off.'],aga:['BoardVerse 預設：Area 面積計分、Komi 7.5、Positional Superko、禁止自殺著。','BoardVerse 默认：Area 面积计分、Komi 7.5、Positional Superko、禁止自杀着。','BoardVerse preset: Area scoring, komi 7.5, Positional Superko, suicide off.'],newzealand:['BoardVerse 預設：Area 面積計分、Komi 7、Positional Superko、允許自殺著。','BoardVerse 默认：Area 面积计分、Komi 7、Positional Superko、允许自杀着。','BoardVerse preset: Area scoring, komi 7, Positional Superko, suicide on.']},scoring:{area:['計算己方盤上棋子與己方圍住的空點；提子不另外加分。','计算己方盘上棋子与己方围住的空点；提子不另外加分。','Counts your stones on the board plus surrounded empty points; captures are not added separately.'],territory:['計算己方圍住的空地並加上提子數；未判定死活的棋仍可能影響結果。','计算己方围住的空地并加上提子数；未判定死活的棋仍可能影响结果。','Counts surrounded empty territory plus captures; unresolved life/death can still affect the result.']},koRule:{simple:['只禁止立即把盤面還原成上一個劫前局面。','只禁止立即把盘面还原成上一个劫前局面。','Only forbids the immediate recapture that restores the previous ko position.'],superko:['禁止落子後形成本局先前已出現過的相同盤面。','禁止落子后形成本局先前已出现过的相同盘面。','Forbids a move that recreates a board position already seen in the game.']},mode:{standard:['雙方連續 Pass 後依終局計分規則結算。','双方连续 Pass 后依终局计分规则结算。','After consecutive passes, the game is settled by the selected scoring rules.'],capture:['先達到指定提子目標者立即獲勝，不以地盤分數決勝。','先达到指定提子目标者立即获胜，不以地盘分数决胜。','The first player to reach the capture target wins immediately; territory scoring is not used to decide the winner.']}};return m[key]&&m[key][String(value)]?m[key][String(value)][z]:''}
function buildRuleDetailNode(gameId){var wrap=document.createElement('div');wrap.className='rule-detail-list';var game=SERVER_GAMES[gameId],family=game&&game.family,def=family&&SERVER_RULES[family];if(!def||!def.fields||!def.fields.length){var empty=document.createElement('p');empty.textContent=lang==='en'?'This game has no configurable rule fields.':lang==='zh-Hans'?'这个棋类没有可调整的规则字段。':'這個棋類沒有可調整的規則欄位。';wrap.appendChild(empty);return wrap}def.fields.forEach(function(f){var item=document.createElement('section');item.className='rule-detail-item';var title=document.createElement('strong');title.textContent=fieldTranslation(family,f.key,'label',f.label)+' !';item.appendChild(title);var help=document.createElement('p');help.textContent=helpTranslation(family,f.key,f.help)||'';item.appendChild(help);if(f.options&&f.options.length){var ul=document.createElement('ul');ul.className='rule-detail-options';f.options.forEach(function(o){var li=document.createElement('li');var label=optionTranslation(family,f.key,o[0],String(o[1]));var extra=family==='go'?goOptionDetail(f.key,o[0]):'';li.textContent=label+(extra?' — '+extra:'');ul.appendChild(li)});item.appendChild(ul)}else if(f.type==='checkbox'){var vals=document.createElement('p');vals.className='small muted';vals.textContent=lang==='en'?'Choices: Yes / No':lang==='zh-Hans'?'选项：是 / 否':'選項：是 / 否';item.appendChild(vals)}else if(f.type==='number'){var range=document.createElement('p');range.className='small muted';var d=def.defaults&&def.defaults[f.key];range.textContent=(lang==='en'?'Default ':'預設 ')+String(d)+(f.min!=null&&f.max!=null?' · '+(lang==='en'?'Range ':'範圍 ')+f.min+'–'+f.max:'');item.appendChild(range)}wrap.appendChild(item)});return wrap}
function openGameRuleDetails(gameId){openModal(gameText(gameId,0)+' · '+ruleDetailsLabel(),'',{node:buildRuleDetailNode(gameId),cancel:false,confirmText:t('confirm')})}
function syncRuleControls(gameId,family,def,box){var draft=ruleDrafts[gameId]||{};def.fields.forEach(function(f){var el=box.querySelector('[data-rule-key="'+f.key+'"]');if(!el)return;el.disabled=false;el.removeAttribute('disabled');el.removeAttribute('aria-disabled');el.style.pointerEvents='auto';if(document.activeElement!==el&&Object.prototype.hasOwnProperty.call(draft,f.key)){if(f.type==='checkbox')el.checked=!!draft[f.key];else el.value=String(draft[f.key])}var row=el.closest('.setting-row');if(row&&f.when){var depKey=Object.keys(f.when)[0];row.classList.toggle('hidden',String(draft[depKey])!==String(f.when[depKey]))}})}
function renderRuleFields(){var box=$('ruleFields');if(!box)return;var locked=box.closest('fieldset[disabled]');if(locked&&$('createForm')&&$('createForm').contains(locked))locked.disabled=false;var gameId=$('gameId').value;if(!gameId||!SERVER_GAMES[gameId]){box.textContent='';return}var family=SERVER_GAMES[gameId].family,def=SERVER_RULES[family];if(!def){box.textContent='';return}var values=Object.assign({},def.defaults,ruleDrafts[gameId]||{});ruleDrafts[gameId]=values;box.textContent='';box.setAttribute('data-game-id',gameId);def.fields.forEach(function(f){var row=document.createElement('div');row.className='setting-row';if(f.when){var depKey=Object.keys(f.when)[0];if(String(values[depKey])!==String(f.when[depKey]))row.classList.add('hidden')}var lab=document.createElement('div');lab.className='setting-label';var span=document.createElement('span');span.textContent=fieldTranslation(family,f.key,'label',f.label);lab.appendChild(span);row.appendChild(lab);var el;if(f.type==='checkbox'){var wrap=document.createElement('label');wrap.className='setting-check';el=document.createElement('input');el.type='checkbox';el.checked=!!values[f.key];var text=document.createElement('span');text.textContent=lang==='en'?'Enabled':lang==='zh-Hans'?'开启':'開啟';wrap.appendChild(el);wrap.appendChild(text);row.appendChild(wrap)}else if(f.type==='select'){el=document.createElement('select');(f.options||[]).forEach(function(o){var op=document.createElement('option');op.value=String(o[0]);op.textContent=optionTranslation(family,f.key,o[0],String(o[1]));if(String(values[f.key])===String(o[0]))op.selected=true;el.appendChild(op)});row.appendChild(el)}else{el=document.createElement('input');el.type='number';el.min=f.min;el.max=f.max;el.step=f.step||1;el.value=values[f.key];row.appendChild(el)}el.setAttribute('data-rule-key',f.key);el.disabled=false;el.removeAttribute('disabled');el.removeAttribute('aria-disabled');el.style.pointerEvents='auto';function saveDraft(){ruleDrafts[gameId][f.key]=ruleControlValue(f,el)}el.addEventListener('input',saveDraft);el.addEventListener('change',function(){saveDraft();if(family==='go'&&f.key==='ruleset'){var p={chinese:{scoring:'area',komi:7.5,koRule:'simple',suicide:false},japanese:{scoring:'territory',komi:6.5,koRule:'simple',suicide:false},aga:{scoring:'area',komi:7.5,koRule:'superko',suicide:false},newzealand:{scoring:'area',komi:7,koRule:'superko',suicide:true}}[String(ruleDrafts[gameId].ruleset)];if(p)Object.assign(ruleDrafts[gameId],p)}if(family==='gomoku'&&f.key==='variant'&&ruleDrafts[gameId].variant==='connect6')ruleDrafts[gameId].opening='none';syncRuleControls(gameId,family,def,box)});box.appendChild(row)})}
function renderGameCatalog(){var sel=$('gameId'),current=sel.value;sel.textContent='';$('gameList').textContent='';var goGroup=document.createElement('optgroup');goGroup.label=lang==='en'?'Go':lang==='zh-Hans'?'围棋':'圍棋';var fiveGroup=document.createElement('optgroup');fiveGroup.label=lang==='en'?'Gomoku & variants':lang==='zh-Hans'?'五子棋与变种':'五子棋與變種';sel.appendChild(goGroup);sel.appendChild(fiveGroup);Object.keys(SERVER_GAMES).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id==='go9'?'9×9':id==='go13'?'13×13':id==='go19'?'19×19':id==='renju'?gameText(id,0)+(lang==='en'?' (Gomoku variant)':lang==='zh-Hans'?'（五子棋变种）':'（五子棋變種）'):gameText(id,0);if(id==='go9'||id==='go13'||id==='go19')goGroup.appendChild(o);else if(id==='gomoku'||id==='renju')fiveGroup.appendChild(o);else sel.appendChild(o);var c=document.createElement('article');c.className='game-card';var detail=document.createElement('button');detail.type='button';detail.className='btn ghost game-rule-detail';detail.textContent=ruleDetailsLabel();detail.addEventListener('click',function(){openGameRuleDetails(id)});var st=document.createElement('strong');st.textContent=gameText(id,0);var p=document.createElement('p');p.textContent=gameText(id,1);c.appendChild(detail);c.appendChild(st);c.appendChild(p);$('gameList').appendChild(c)});sel.appendChild(fiveGroup);if(current&&SERVER_GAMES[current])sel.value=current;renderRuleFields()}
function openRoomGate(code){code=cleanCode(code);if(code.length!==6)return;gateCode=code;history.pushState(null,'',roomPath(code));showView('roomGate');$('gateTitle').textContent=code;$('gateMeta').textContent=t('loading');setGateNotice('');api('/api/rooms/'+code+'/info').then(function(d){gateInfo=d.room;renderGate(gateInfo)}).catch(function(e){gateInfo=null;$('gateMeta').textContent='';$('gateStatus').textContent='';setGateNotice(e.message||t('roomNotFound'),true);$('enterPlayer').disabled=true;$('enterSpectator').disabled=true})}
function renderGate(info){if(!info)return;$('gateTitle').textContent=info.name;$('gateMeta').textContent=gameText(info.gameId,0)+' · '+info.id+' · '+info.playerCount+'/2'+(info.queueEnabled?' · '+t('queueCount')+' '+info.queueLength:'');$('gateStatus').textContent=statusText(info.status);var btn=$('enterPlayer'),hint=$('playerChoiceHint');btn.disabled=info.playerAction==='disabled';if(info.playerAction==='queue'){btn.querySelector('strong').textContent=t('queueJoin');hint.textContent=t('queueMode')}else if(info.playerAction==='request'){btn.querySelector('strong').textContent=info.privateRoom?t('requestSeat'):t('joinSeat');hint.textContent=info.privateRoom?t('pending'):t('player')}else if(info.playerAction==='disabled'){btn.querySelector('strong').textContent=t('playerFull');hint.textContent=t('spectatorHint')}else{btn.querySelector('strong').textContent=t('joinSeat');hint.textContent=t('player')} $('enterSpectator').disabled=false}
function enterGate(role){if(!gateCode)return;var name=$('gateName').value.trim(),password=$('gatePassword').value;if(!name){setGateNotice(t('yourName'),true);return}setGateNotice(t('entering'));api('/api/rooms/'+gateCode+'/enter',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerName:name,returnPassword:password,role:role,sessionToken:session&&session.roomId===gateCode?session.token:''})}).then(function(d){saveSession(d,name)}).catch(function(e){setGateNotice(e.message,true);if(e.code==='room_full'&&gateInfo){gateInfo.playerAction='disabled';renderGate(gateInfo)}})}
function publicRoomMatches(r,q){if(!q)return true;var hay=[r.id,r.name,gameText(r.gameId,0),statusText(r.status)].join(' ').toLocaleLowerCase();return hay.indexOf(q.toLocaleLowerCase())>=0}
function makePublicRoomRow(r){var row=document.createElement('div');row.className='room-row';var info=document.createElement('div');var a=document.createElement('strong');a.textContent=r.name+' · '+gameText(r.gameId,0);var b=document.createElement('div');b.className='small muted room-row-meta';b.textContent=r.id+' · '+statusText(r.status)+' · '+r.players+'/2'+(r.queueEnabled?' · '+t('queueCount')+' '+r.queueLength:'');info.appendChild(a);info.appendChild(b);var btn=document.createElement('button');btn.className='btn secondary';btn.type='button';btn.textContent=t('open');btn.addEventListener('click',function(){openRoomGate(r.id)});row.appendChild(info);row.appendChild(btn);return row}
function renderPublicRoomColumn(list,rooms,emptyText){list.textContent='';if(!rooms.length){list.className='room-list muted';var e=document.createElement('div');e.className='small muted';e.textContent=emptyText;list.appendChild(e);return}list.className='room-list';rooms.forEach(function(r){list.appendChild(makePublicRoomRow(r))})}
function renderPublicRooms(rooms){rooms=(rooms||[]).filter(function(r){return r.status==='playing'||r.status==='waiting'});var q=$('roomSearch')?$('roomSearch').value.trim():'';var filtered=rooms.filter(function(r){return publicRoomMatches(r,q)});var playing=filtered.filter(function(r){return r.status==='playing'});var waiting=filtered.filter(function(r){return r.status==='waiting'});$('playingRoomCount').textContent=String(playing.length);$('waitingRoomCount').textContent=String(waiting.length);var none=q?(lang==='en'?'No matching rooms':lang==='zh-Hans'?'没有匹配的房间':'沒有符合搜尋的房間'):t('noPublicRooms');renderPublicRoomColumn($('playingRoomList'),playing,none);renderPublicRoomColumn($('waitingRoomList'),waiting,none)}
function refreshRooms(){var playing=$('playingRoomList'),waiting=$('waitingRoomList');if(window.boardverseBindingMissing){playing.textContent='Cloudflare Durable Object: ROOMS → GameRoom';waiting.textContent='';return}playing.textContent=t('loading');waiting.textContent=t('loading');api('/api/rooms').then(function(d){publicRoomsCache=Array.isArray(d.rooms)?d.rooms:[];renderPublicRooms(publicRoomsCache)}).catch(function(e){if(e.code==='missing_binding'){setBindingState(false);return}playing.textContent=e.message;playing.className='room-list err';waiting.textContent='';waiting.className='room-list'})}
function connectRoom(){if(!session)return;if(ws){try{ws.close()}catch(e){}}history.replaceState(null,'',roomPath(session.roomId));showView('room');var proto=location.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(proto+'//'+location.host+'/ws/'+encodeURIComponent(session.roomId)+'?token='+encodeURIComponent(session.token));setRoomNotice(t('loading'));ws.addEventListener('open',function(){setRoomNotice('');send({type:'state'})});ws.addEventListener('message',function(ev){if(ev.data==='pong')return;try{var m=JSON.parse(ev.data);if(m.type==='state'){var oldMove=lastMoveKey;roomState=m.room;selected=null;var newMove=JSON.stringify(roomState&&roomState.gameState&&roomState.gameState.lastMove||null)+'|'+String(roomState&&roomState.gameState&&roomState.gameState.moveNumber||0);if(oldMove&&newMove!==oldMove)playSound('move');lastMoveKey=newMove;renderRoom()}else if(m.type==='error'){setRoomNotice(m.message,true);toast(m.message,'bad')}else if(m.type==='queue_turn'){notifyQueueTurn()}else if(m.type==='replay_data'){openReplay(m.replay)}else if(m.type==='match_end'){playSound('end')}else if(m.type==='session_end'){toast(m.message,'bad');localStorage.removeItem('boardverseSession');session=null;setTimeout(function(){showView('roomGate');openRoomGate(gateCode||pathCode())},700)}}catch(e){setRoomNotice('Invalid message',true)}});ws.addEventListener('close',function(){if(!session)return;setRoomNotice(lang==='en'?'Disconnected. Reconnecting…':lang==='zh-Hans'?'连接中断，3 秒后重连…':'連線中斷，3 秒後重連…',true);setTimeout(function(){if(session)connectRoom()},3000)});ws.addEventListener('error',function(){setRoomNotice('WebSocket error',true)})}
function send(obj){if(!ws||ws.readyState!==WebSocket.OPEN){setRoomNotice('WebSocket offline',true);return false}ws.send(JSON.stringify(obj));return true}
function renderRoom(){var r=roomState;if(!r)return;$('roomTitle').textContent=r.name;$('roomMeta').textContent=gameText(r.gameId,0)+' · '+(r.privateRoom?(lang==='en'?'Private':'私人房'):(lang==='en'?'Public':'公開房'))+' · '+statusText(r.status)+' · '+r.id;renderPlayers(r);renderPending(r);renderQueue(r);renderStatus(r);renderReplays(r);renderChat(r);renderRules(r);renderBoard()}
function renderPlayers(r){var el=$('players');el.textContent='';[[t('playerA'),r.players.host],[t('playerB'),r.players.guest]].forEach(function(pair){var d=document.createElement('div');d.className='player-card card'+(pair[1]&&r.status==='playing'&&pair[1].side===r.gameState.turn?' active':'');var icon=document.createElement('div');icon.className='seat-icon';icon.textContent=pair[1]?sideName(r.gameId,pair[1].side).charAt(0):'–';var txt=document.createElement('div');var strong=document.createElement('strong');strong.textContent=pair[1]?pair[1].name:pair[0]+' · '+t('emptySeat');var sub=document.createElement('div');sub.className='small muted';if(pair[1])sub.textContent=sideName(r.gameId,pair[1].side)+' · '+(pair[1].connected?t('online'):(t('offline')+(pair[1].offlineDeadline?' · 60s → '+t('resign'):'')))+(pair[1].isOwner?' · '+t('host'):'');else sub.textContent=t('waiting');txt.appendChild(strong);txt.appendChild(sub);d.appendChild(icon);d.appendChild(txt);el.appendChild(d)})}
function renderPending(r){var box=$('pendingBox'),list=$('pendingList');list.textContent='';if(r.isHost&&r.pending.length){box.classList.remove('hidden');r.pending.forEach(function(p){var row=document.createElement('div');row.className='pending-row';var n=document.createElement('span');n.textContent=p.name;var acts=document.createElement('div');acts.className='actions';var y=document.createElement('button');y.className='btn';y.type='button';y.textContent=t('approve');y.addEventListener('click',function(){send({type:'review_join',requestId:p.id,approve:true})});var no=document.createElement('button');no.className='btn ghost';no.type='button';no.textContent=t('reject');no.addEventListener('click',function(){send({type:'review_join',requestId:p.id,approve:false})});acts.appendChild(y);acts.appendChild(no);row.appendChild(n);row.appendChild(acts);list.appendChild(row)})}else box.classList.add('hidden')}
function renderQueue(r){$('queueMeta').textContent=t('queueCount')+' '+r.queue.length+' · '+t('spectatorCount')+' '+r.spectatorCount;$('hostQueueSettings').classList.toggle('hidden',!r.isHost);if(r.isHost){$('queueEnabledRoom').checked=!!r.queueSettings.queueEnabled;$('rotationRoom').value=r.queueSettings.rotationPolicy}var list=$('queueList');list.textContent='';if(!r.queue.length){var e=document.createElement('div');e.className='small muted';e.textContent=t('queueEmpty');list.appendChild(e);return}r.queue.forEach(function(q){var row=document.createElement('div');row.className='queue-row';var text=document.createElement('span');text.textContent=q.position+'. '+q.name+(q.id===r.myMemberId?' · '+t('queued'):'');row.appendChild(text);if(r.isHost){var acts=document.createElement('div');acts.className='actions';['up','down'].forEach(function(dir){var b=document.createElement('button');b.className='btn ghost';b.type='button';b.textContent=dir==='up'?'↑':'↓';b.setAttribute('aria-label',dir==='up'?t('moveUp'):t('moveDown'));b.addEventListener('click',function(){send({type:'queue_move',memberId:q.id,direction:dir})});acts.appendChild(b)});row.appendChild(acts)}list.appendChild(row)})}
function goEstimateNumber(n){var x=Number(n)||0;return Math.round(x*10)/10}
function goPositionText(d,unit){var a=Math.abs(d),u=unit||'';if(d===0)return lang==='en'?'Current position: even':lang==='zh-Hans'?'当前形势：双方持平':'目前形勢：雙方持平';if(d>0)return lang==='en'?'Current position: Black leads by '+a+u+' (White trails by '+a+u+')':lang==='zh-Hans'?'当前形势：黑方领先 '+a+u+'（白方落后 '+a+u+'）':'目前形勢：黑方領先 '+a+u+'（白方落後 '+a+u+'）';return lang==='en'?'Current position: White leads by '+a+u+' (Black trails by '+a+u+')':lang==='zh-Hans'?'当前形势：白方领先 '+a+u+'（黑方落后 '+a+u+'）':'目前形勢：白方領先 '+a+u+'（黑方落後 '+a+u+'）'}
function renderGoEstimate(r,g){var el=$('goEstimate');if(!el)return;var e=g&&g.liveEstimate;if(!e||g.type!=='go'||r.status!=='playing'){el.classList.add('hidden');el.textContent='';return}el.classList.remove('hidden');var B=goEstimateNumber(e.B),W=goEstimateNumber(e.W),d=goEstimateNumber(B-W);if(e.kind==='capture'){var label=lang==='en'?'Capture Go progress':lang==='zh-Hans'?'吃子棋进度':'吃子棋進度',goal=lang==='en'?'goal ':'目標 ',unit=lang==='en'?' captures':' 子';el.textContent=label+': B '+B+' / W '+W+' · '+goal+goEstimateNumber(e.goal)+' · '+goPositionText(d,unit);return}var label2=lang==='en'?'Live estimate':lang==='zh-Hans'?'实时估算':'即時估算',suffix=lang==='en'?' · life/death unresolved':' · 未判定死活',unit2=lang==='en'?' pts':' 目';el.textContent=label2+': B '+B+' / W '+W+' · '+goPositionText(d,unit2)+suffix}
function refreshLastMoveMarkerLabel(){var label=lang==='en'?'Last move marker':lang==='zh-Hans'?'上一手标记':'上一手標記';$('lastMoveMarkerLabel').textContent=label;$('lastMoveMarkerToggle').setAttribute('aria-label',label)}
function setLastMoveMarkerEnabled(enabled){document.body.classList.toggle('hide-last-move-dot',!enabled)}
function renderStatus(r){var g=r.gameState;$('turnInfo').textContent=r.status==='playing'?t('turn')+' '+sideName(r.gameId,g.turn):r.status==='waiting'?t('waiting'):t('finished');var role=r.rawRole==='player'?t('player')+(r.isHost?' · '+t('host'):'')+' · '+sideName(r.gameId,r.mySide):r.rawRole==='queued'?t('queued'):r.rawRole==='spectator'?t('spectator'):t('pending');$('roleInfo').textContent=role;$('lastMoveMarkerSetting').classList.toggle('hidden',!g||['go','gomoku','renju'].indexOf(g.type)<0);renderGoEstimate(r,g);$('passBtn').classList.toggle('hidden',['go9','go13','go19'].indexOf(r.gameId)<0||r.status!=='playing'||r.rawRole!=='player');$('swapBtn').classList.toggle('hidden',!r.canSwap||r.status!=='playing'||r.rawRole!=='player');$('resignBtn').disabled=r.rawRole!=='player'||r.status!=='playing';$('rematchBtn').classList.toggle('hidden',r.status!=='finished'||r.rawRole!=='player'||r.queueSettings.queueEnabled);var b=$('resultBanner');if(!r.resultSummary){b.className='result-banner hidden'}else{var s=r.resultSummary;b.className='result-banner '+(s.outcome==='win'?'win':s.outcome==='loss'?'loss':'draw');$('resultTitle').textContent=s.outcome==='win'?t('win'):s.outcome==='loss'?t('loss'):s.outcome==='draw'?t('draw'):(s.winnerName?s.winnerName+' '+(lang==='en'?'wins':'勝'):t('roomEnded'));$('resultReason').textContent=(s.winnerName?(lang==='en'?'Winner: ':'勝者：')+s.winnerName+' · ':'')+s.reason}}
function renderReplays(r){var list=$('replayList');list.textContent='';var items=Array.isArray(r.replays)?r.replays:[];if(!items.length){var e=document.createElement('div');e.className='small muted';e.textContent=t('noReplays');list.appendChild(e);return}items.forEach(function(rep){var row=document.createElement('div');row.className='replay-row';var info=document.createElement('div');var names=(rep.players||[]).map(function(p){return p.name}).join(' vs ');var strong=document.createElement('strong');strong.textContent=names||gameText(rep.gameId,0);var meta=document.createElement('div');meta.className='small muted';meta.textContent=(rep.actionCount||0)+' '+t('replayStep')+(rep.partial?' · partial':'');info.appendChild(strong);info.appendChild(meta);var btn=document.createElement('button');btn.className='btn ghost';btn.type='button';btn.textContent=t('replay');btn.addEventListener('click',function(){send({type:'replay_get',replayId:rep.id})});row.appendChild(info);row.appendChild(btn);list.appendChild(row)})}
function openReplay(data){if(!data||!Array.isArray(data.frames)||!data.frames.length){toast('Replay unavailable','bad');return}replayData=data;replayIndex=0;$('replayMatchTitle').textContent=(data.players||[]).map(function(p){return p.name}).join(' vs ')||gameText(data.gameId,0);$('replayMeta').textContent=gameText(data.gameId,0)+' · '+(data.actionCount||0)+' '+t('replayStep')+(data.partial?' · partial':'');$('replayResult').textContent=data.result?((data.result.winnerName?(lang==='en'?'Winner: ':'勝者：')+data.result.winnerName+' · ':'')+(data.result.reason||'')):'';$('replayRange').min='0';$('replayRange').max=String(data.frames.length-1);$('replayRange').value='0';$('replayOverlay').classList.remove('hidden');renderReplayFrame()}
function closeReplay(){$('replayOverlay').classList.add('hidden');replayData=null;replayIndex=0}
function renderReplayFrame(){if(!replayData)return;var frames=replayData.frames,frame=frames[Math.max(0,Math.min(replayIndex,frames.length-1))];replayIndex=frame.index;$('replayRange').value=String(replayIndex);$('replayPrev').disabled=replayIndex<=0;$('replayNext').disabled=replayIndex>=frames.length-1;$('replayStep').textContent=t('replayStep')+' '+replayIndex+' / '+(frames.length-1)+(frame.label?' · '+frame.label:'');renderGameBoard(frame.game,$('replayBoard'),false)}
function replayStep(delta){if(!replayData)return;replayIndex=Math.max(0,Math.min(replayData.frames.length-1,replayIndex+delta));renderReplayFrame()}
function renderChat(r){var list=$('chatList'),input=$('chatInput'),btn=$('chatSend'),blocked=r.chatChannel==='none';$('chatTitle').textContent=r.chatChannel==='players'?t('playersChat'):r.chatChannel==='spectators'?t('spectatorChat'):t('chat');$('chatHint').textContent=r.chatChannel==='spectators'?(lang==='en'?'Hidden from players':'玩家不會收到此頻道訊息'):(r.chatChannel==='players'?(lang==='en'?'Players only':'只傳送給玩家'):'');input.disabled=blocked;btn.disabled=blocked;input.placeholder=blocked?t('pendingChat'):'…';var atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<55;list.textContent='';if(!r.chat||!r.chat.length){var e=document.createElement('div');e.className='chat-empty';e.textContent=blocked?t('pendingChat'):t('noMessages');list.appendChild(e);lastChatId=0;return}r.chat.forEach(function(m){var wrap=document.createElement('div');wrap.className='chat-msg'+(m.memberId===r.myMemberId?' me':'');var meta=document.createElement('div');meta.className='chat-meta';meta.textContent=m.name+' · '+new Date(m.at||Date.now()).toLocaleTimeString(lang==='en'?'en-US':lang==='zh-Hans'?'zh-CN':'zh-TW',{hour:'2-digit',minute:'2-digit'});var bubble=document.createElement('div');bubble.className='chat-bubble';bubble.textContent=String(m.text||'');wrap.appendChild(meta);wrap.appendChild(bubble);list.appendChild(wrap)});var newest=r.chat[r.chat.length-1].id||0;if(atBottom||newest!==lastChatId)list.scrollTop=list.scrollHeight;lastChatId=newest}
function renderRules(r){$('ruleInfo').textContent=localizedRulesSummary(r.gameId,r.rules,r.ruleDefs)||gameText(r.gameId,1);var list=$('roomRuleList');list.textContent='';var def=r.ruleDefs;if(!def||!def.fields)return;def.fields.forEach(function(f){var row=document.createElement('div');row.className='queue-row';var key=document.createElement('span');key.textContent=fieldTranslation(def.family,f.key,'label',f.label);var val=document.createElement('span');val.className='small muted';var raw=r.rules[f.key];val.textContent=ruleValueText(def.family,f,raw);var rhs=document.createElement('span');rhs.style.display='inline-flex';rhs.style.alignItems='center';rhs.style.gap='6px';rhs.appendChild(val);row.appendChild(key);row.appendChild(rhs);list.appendChild(row)})}
function makeSvg(rows,cols,type){var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-0.5 -0.5 '+cols+' '+rows);svg.setAttribute('aria-hidden','true');var color=type==='xq'?'#5d3c18':'#5b3a16';function line(x1,y1,x2,y2,w){var l=document.createElementNS(svg.namespaceURI,'line');l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2);l.setAttribute('stroke',color);l.setAttribute('stroke-width',w||'0.035');svg.appendChild(l)}if(type==='xq'){for(var y=0;y<10;y++)line(0,y,8,y);for(var x=0;x<9;x++){if(x===0||x===8)line(x,0,x,9);else{line(x,0,x,4);line(x,5,x,9)}}line(3,0,5,2);line(5,0,3,2);line(3,7,5,9);line(5,7,3,9);var t1=document.createElementNS(svg.namespaceURI,'text');t1.setAttribute('x','1.7');t1.setAttribute('y','4.67');t1.setAttribute('fill',color);t1.setAttribute('font-size','.42');t1.setAttribute('font-family','serif');t1.textContent='楚 河';svg.appendChild(t1);var t2=t1.cloneNode();t2.setAttribute('x','5.25');t2.textContent='漢 界';svg.appendChild(t2)}else{for(var yy=0;yy<rows;yy++)line(0,yy,cols-1,yy);for(var xx=0;xx<cols;xx++)line(xx,0,xx,rows-1);starPoints(cols).forEach(function(p){var c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('cx',p[1]);c.setAttribute('cy',p[0]);c.setAttribute('r',cols>=19?'.11':'.095');c.setAttribute('fill',color);svg.appendChild(c)})}return svg}
function starPoints(n){if(n===19)return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];if(n===13)return [[3,3],[3,9],[6,6],[9,3],[9,9]];if(n===9)return [[2,2],[2,6],[4,4],[6,2],[6,6]];if(n===15)return [[3,3],[3,11],[7,7],[11,3],[11,11]];return []}
function intrinsicBoardSize(g){if(g.type==='xiangqi')return{w:540,h:600};if(g.type==='go'||g.type==='gomoku'||g.type==='renju'){var n=g.size||15;var s=n>=19?620:n>=15?540:n>=13?500:430;return{w:s,h:s}}return{w:720,h:720}}
function fitBoardToStage(el,g){if(!el||!g)return;var fit=$('boardFit'),stage=$('boardStage');if(!fit||!stage)return;var base=intrinsicBoardSize(g);var desktop=document.body.classList.contains('room-mode')&&window.matchMedia&&window.matchMedia('(min-width:960px) and (orientation:landscape)').matches;var sw=Math.max(0,stage.clientWidth-8),sh=Math.max(0,stage.clientHeight-8);if(!sw)return;var scale=Math.min(1,sw/base.w);if(desktop&&sh>0)scale=Math.min(scale,sh/base.h);scale=Math.max(.08,scale);fit.style.width=Math.max(1,Math.floor(base.w*scale))+'px';fit.style.height=Math.max(1,Math.floor(base.h*scale))+'px';el.style.width=base.w+'px';el.style.height=base.h+'px';el.style.maxWidth='none';el.style.maxHeight='none';el.style.transform='scale('+scale+')';el.style.transformOrigin='top left'}
function renderBoard(){if(!roomState||!roomState.gameState)return;renderGameBoard(roomState.gameState,$('board'),true);requestAnimationFrame(function(){fitBoardToStage($('board'),roomState&&roomState.gameState)})}
function renderGameBoard(g,el,interactive){if(!g||!el)return;el.textContent='';if(g.type==='go'||g.type==='gomoku'||g.type==='renju')renderIntersectionBoard(g,el,interactive);else if(g.type==='xiangqi')renderXiangqi(g,el,interactive);else renderSquareBoard(g,el,interactive)}
function renderIntersectionBoard(g,el,interactive){var n=g.size;el.className='board line-board';el.style.width='100%';el.style.maxWidth=n>=19?'620px':n>=15?'540px':n>=13?'500px':'430px';el.style.setProperty('--point-size',n<=9?'9.8cqw':n<=13?'7.2cqw':n<=15?'6.2cqw':'4.8cqw');el.appendChild(makeSvg(n,n,'line'));for(var i=0;i<g.board.length;i++){var r=Math.floor(i/n),c=i%n,b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';b.className='point-btn'+(g.lastMove&&g.lastMove.r===r&&g.lastMove.c===c?' last':'');b.style.left=((c+.5)/n*100)+'%';b.style.top=((r+.5)/n*100)+'%';if(interactive)b.setAttribute('aria-label',(r+1)+','+(c+1));if(g.board[i])b.appendChild(stone(g.board[i]));if(interactive)bindPoint(b,i,n,n);el.appendChild(b)}}
function renderXiangqi(g,el,interactive){el.className='board xiangqi-board';el.style.width='100%';el.style.maxWidth='560px';el.appendChild(makeSvg(10,9,'xq'));for(var i=0;i<90;i++){var r=Math.floor(i/9),c=i%9,b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';b.className='point-btn'+(interactive&&selected===i?' selected':'')+(g.lastMove&&g.lastMove.to===i?' last':'');b.style.left=((c+.5)/9*100)+'%';b.style.top=((r+.5)/10*100)+'%';var p=g.board[i];if(p)b.appendChild(xqPiece(p));if(interactive)bindPoint(b,i,10,9);el.appendChild(b)}}
function renderSquareBoard(g,el,interactive){var size=Number(g.size)||8;el.className='board square-board '+(g.type==='chess'?'chess-board':'reversi-board');el.style.width='100%';el.style.maxWidth='720px';el.style.gridTemplateColumns='repeat('+size+',1fr)';for(var i=0;i<size*size;i++){var r=Math.floor(i/size),c=i%size,b=document.createElement(interactive?'button':'div');if(interactive)b.type='button';b.className='sq '+((r+c)%2?'dark':'light')+(interactive&&selected===i?' selected':'')+(g.lastMove&&(g.lastMove.to===i||(g.lastMove.r===r&&g.lastMove.c===c))?' last':'');var p=g.board[i];if(p)b.appendChild(g.type==='chess'?chessPiece(p):stone(p));if(interactive)bindPoint(b,i,size,size);el.appendChild(b)}}
function bindPoint(el,index,rows,cols){el.addEventListener('click',function(){boardClick(index,rows,cols)})}
function stone(p){var s=document.createElement('span');s.className='stone '+(p==='B'?'black':'white');return s}
function xqPiece(p){var m={rK:'帥',rA:'仕',rE:'相',rH:'傌',rR:'俥',rC:'炮',rP:'兵',bK:'將',bA:'士',bE:'象',bH:'馬',bR:'車',bC:'砲',bP:'卒'},s=document.createElement('span');s.className='xq-piece '+(p[0]==='r'?'red':'black');s.textContent=m[p]||p;return s}
function chessPiece(p){var m={wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'},s=document.createElement('span');s.className='chess-piece '+(p[0]==='w'?'white':'black');s.textContent=m[p]||p;return s}
function boardClick(index,rows,cols){var r=roomState,g=r&&r.gameState;if(!r||r.rawRole!=='player'||r.status!=='playing'||r.mySide!==g.turn)return;var row=Math.floor(index/cols),col=index%cols;if(g.type==='go'||g.type==='gomoku'||g.type==='renju'||g.type==='reversi'){send({type:'move',r:row,c:col});return}var p=g.board[index],mine=g.type==='chess'?(r.mySide==='W'?'w':'b'):(r.mySide==='R'?'r':'b');if(selected==null){if(p&&p[0]===mine){selected=index;renderBoard()}return}if(p&&p[0]===mine){selected=index;renderBoard();return}send({type:'move',from:selected,to:index});selected=null}
function ensureAudio(){if(!audioCtx){var AC=window.AudioContext||window.webkitAudioContext;if(AC)audioCtx=new AC()}if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(function(){})}
function playSound(kind){if(!$('soundEnabled').checked)return;ensureAudio();if(!audioCtx)return;var volume=Number($('soundVolume').value)||0.4;var now=audioCtx.currentTime;var osc=audioCtx.createOscillator(),gain=audioCtx.createGain();var freq=kind==='queue'?880:kind==='end'?520:420;osc.type=kind==='move'?'sine':'triangle';osc.frequency.setValueAtTime(freq,now);if(kind==='queue')osc.frequency.exponentialRampToValueAtTime(1320,now+.12);gain.gain.setValueAtTime(Math.max(.001,volume*.16),now);gain.gain.exponentialRampToValueAtTime(.001,now+(kind==='queue'?.28:.12));osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+(kind==='queue'?.3:.14))}
function setupNotifications(){if(!('serviceWorker'in navigator)||!('Notification'in window)){toast(t('notifyFallback'),'bad');return Promise.resolve(false)}return navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(function(reg){swReg=reg;return Notification.requestPermission()}).then(function(p){if(p==='granted'){toast(t('notifyEnabled'),'good');return true}toast(t('notifyFallback'),'bad');return false}).catch(function(){toast(t('notifyFallback'),'bad');return false})}
function notifyQueueTurn(){playSound('queue');var url=roomUrl(session&&session.roomId||pathCode());if(typeof Notification==='undefined'||Notification.permission!=='granted'||!('serviceWorker'in navigator)){toast(t('yourTurn'),'good');return}var ready=swReg?Promise.resolve(swReg):navigator.serviceWorker.ready;ready.then(function(reg){return reg.showNotification(t('yourTurn'),{body:t('queueTurnBody'),tag:'boardverse-queue-'+(session&&session.roomId||''),data:{url:url}})}).catch(function(){playSound('queue');toast(t('yourTurn'),'good')})}
function setBindingState(ready){window.boardverseBindingMissing=!ready;$('platformSetup').classList.toggle('hidden',ready);document.querySelectorAll('#createForm button[type=submit],#codeForm button[type=submit]').forEach(function(btn){btn.disabled=!ready});if(!ready){$('playingRoomList').textContent='ROOMS → GameRoom';$('playingRoomList').className='room-list muted';$('waitingRoomList').textContent=''}}
function checkPlatform(){return fetch('/health',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){setBindingState(!!d.durableObjectBinding);return !!d.durableObjectBinding}).catch(function(){setBindingState(true);return true})}
$('languageSelect').addEventListener('change',function(){lang=this.value;localStorage.setItem('boardverseLang',lang);applyLanguage()});
var savedPageTheme=localStorage.getItem('boardversePageTheme')||localStorage.getItem('boardversePageBackground')||localStorage.getItem('boardverseBoardBackground')||'black';var pageTheme=applyPageTheme(savedPageTheme);localStorage.setItem('boardversePageTheme',pageTheme);localStorage.removeItem('boardversePageBackground');localStorage.removeItem('boardverseBoardBackground');refreshPageBgLabels();$('languageSelect').addEventListener('change',refreshPageBgLabels);$('pageBgBlack').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('black'))});$('pageBgWhite').addEventListener('click',function(){localStorage.setItem('boardversePageTheme',applyPageTheme('white'))});
var lastMoveMarkerEnabled=localStorage.getItem('boardverseLastMoveMarker')!=='off';$('lastMoveMarkerToggle').checked=lastMoveMarkerEnabled;setLastMoveMarkerEnabled(lastMoveMarkerEnabled);refreshLastMoveMarkerLabel();$('languageSelect').addEventListener('change',refreshLastMoveMarkerLabel);$('lastMoveMarkerToggle').addEventListener('change',function(){var enabled=!!this.checked;localStorage.setItem('boardverseLastMoveMarker',enabled?'on':'off');setLastMoveMarkerEnabled(enabled)});
$('soundEnabled').checked=localStorage.getItem('boardverseSound')!=='off';$('soundVolume').value=localStorage.getItem('boardverseVolume')||'0.55';$('soundEnabled').addEventListener('change',function(){localStorage.setItem('boardverseSound',this.checked?'on':'off');ensureAudio()});$('soundVolume').addEventListener('input',function(){localStorage.setItem('boardverseVolume',this.value);ensureAudio()});document.addEventListener('pointerdown',ensureAudio,{once:true});
$('notifyBtn').addEventListener('click',setupNotifications);
if('ResizeObserver'in window){new ResizeObserver(function(){if(roomState&&roomState.gameState&&!$('room').classList.contains('hidden'))fitBoardToStage($('board'),roomState.gameState)}).observe($('boardStage'))}else{window.addEventListener('resize',function(){if(roomState&&roomState.gameState)fitBoardToStage($('board'),roomState.gameState)})}
$('createForm').addEventListener('submit',function(e){e.preventDefault();setNotice(t('creating'));api('/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerName:$('createName').value,returnPassword:$('createPassword').value,roomName:$('roomName').value,gameId:$('gameId').value,privateRoom:$('privateRoom').checked,rules:formRules(),settings:{queueEnabled:$('queueEnabledCreate').checked,rotationPolicy:$('rotationCreate').value}})}).then(function(d){saveSession(d,$('createName').value)}).catch(function(err){setNotice(err.message,true)})});
$('gameId').addEventListener('change',renderRuleFields);$('roomSearch').addEventListener('input',function(){renderPublicRooms(publicRoomsCache)});$('joinCode').addEventListener('input',function(){this.value=cleanCode(this.value)});$('codeForm').addEventListener('submit',function(e){e.preventDefault();var code=cleanCode($('joinCode').value);if(code.length===6)openRoomGate(code)});$('refreshRooms').addEventListener('click',refreshRooms);$('gateBack').addEventListener('click',function(){history.pushState(null,'','/');showView('lobby');gateCode='';gateInfo=null});$('enterPlayer').addEventListener('click',function(){enterGate('player')});$('enterSpectator').addEventListener('click',function(){enterGate('spectator')});$('leaveRoom').addEventListener('click',leave);$('copyLink').addEventListener('click',function(){if(!roomState)return;var url=roomUrl(roomState.id);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){toast(t('copyDone'),'good')}).catch(function(){var node=document.createElement('input');node.value=url;node.readOnly=true;node.style.width='100%';openModal(t('copyLink'),'',{node:node,cancel:false,confirmText:t('confirm')})});else{var node=document.createElement('input');node.value=url;node.readOnly=true;node.style.width='100%';openModal(t('copyLink'),'',{node:node,cancel:false,confirmText:t('confirm')})}});$('passBtn').addEventListener('click',function(){send({type:'pass'})});$('swapBtn').addEventListener('click',function(){send({type:'swap_sides'})});$('resignBtn').addEventListener('click',function(){openModal(t('resign'),t('confirmResign'),{onConfirm:function(){send({type:'resign'})}})});$('rematchBtn').addEventListener('click',function(){send({type:'rematch'})});$('chatForm').addEventListener('submit',function(e){e.preventDefault();var input=$('chatInput'),text=input.value.trim();if(!text)return;send({type:'chat',text:text});input.value='';input.focus()});$('queueEnabledRoom').addEventListener('change',function(){send({type:'queue_settings',enabled:this.checked,rotationPolicy:$('rotationRoom').value})});$('rotationRoom').addEventListener('change',function(){send({type:'queue_settings',enabled:$('queueEnabledRoom').checked,rotationPolicy:this.value})});
$('replayClose').addEventListener('click',closeReplay);$('replayOverlay').addEventListener('click',function(e){if(e.target===this)closeReplay()});$('replayPrev').addEventListener('click',function(){replayStep(-1)});$('replayNext').addEventListener('click',function(){replayStep(1)});$('replayRange').addEventListener('input',function(){replayIndex=Number(this.value)||0;renderReplayFrame()});
$('modalCancel').addEventListener('click',closeModal);$('modalConfirm').addEventListener('click',function(){var fn=modalConfirmAction;closeModal();if(fn)fn()});$('modalOverlay').addEventListener('click',function(e){if(e.target===this)closeModal()});$('helpClose').addEventListener('click',closeHelp);document.addEventListener('click',function(e){var btn=e.target.closest&&e.target.closest('[data-help]');if(btn){var helpKey=btn.getAttribute('data-help');if(helpKey==='rotation'){var rt=lang==='en'?'Winner stays: loser rotates out; on a draw both rotate. Rotate both: both players rotate out after every game. Host stays: the room host always keeps the seat and only the opponent rotates.':lang==='zh-Hans'?'胜者留桌：有胜负时败者转观众、下一位补上；和棋双方轮替。双方轮替：每局结束两位玩家都转观众，再依排队顺序补位。房主留桌：房主固定不动，每局只轮替对手并由排队下一位补上。':'勝者留桌：有勝負時敗者轉觀眾、下一位補上；和棋雙方輪替。雙方輪替：每局結束兩位玩家都轉觀眾，再依排隊順序補位。房主留桌：房主固定不動，每局只輪替對手並由排隊下一位補上。';openHelp(btn,lang==='en'?'Rotation policy':'輪替方式',rt);return}var h=HELP[helpKey],key=lang==='en'?'en':lang==='zh-Hans'?'zhHans':'zhHant';if(h&&h[key])openHelp(btn,h[key][0],h[key][1]);return}if(!$('helpPopover').classList.contains('hidden')&&!e.target.closest('#helpPopover')&&!e.target.closest('.info-btn'))closeHelp()});document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!$('replayOverlay').classList.contains('hidden'))closeReplay();else if(!$('modalOverlay').classList.contains('hidden'))closeModal();else closeHelp()}});document.querySelectorAll('[data-collapse]').forEach(function(btn){btn.addEventListener('click',function(){var body=$(this.getAttribute('data-collapse'));body.classList.toggle('hidden');this.textContent=body.classList.contains('hidden')?'›':'⌄'})});window.addEventListener('popstate',function(){var code=pathCode();if(code){if(session&&session.roomId===code&&session.token)connectRoom();else openRoomGate(code)}else showView('lobby')});
applyLanguage();checkPlatform().then(function(ready){var code=pathCode();if(ready&&session&&session.roomId&&session.token&&(!code||session.roomId===code)){connectRoom()}else if(code){openRoomGate(code)}else{showView('lobby');refreshRooms()}});setInterval(function(){if($('lobby')&&!$('lobby').classList.contains('hidden'))refreshRooms()},12000);
})();
</script>
</body>
</html>`.replace("__APP_VERSION__",APP_VERSION).replace("__CLIENT_RULE_DEFS__", JSON.stringify(RULE_DEFS)).replace("__CLIENT_GAMES__", JSON.stringify(GAME_CATALOG));
