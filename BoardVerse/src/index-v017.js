import appV016, { GameRoom as GameRoomBase, GlobalChat as GlobalChatBase } from "./index-v016.js";
import { MAX_CHAT_TEXT } from "./core/config.js";
import { ensureFeatureState } from "./room/state.js";
import { CHAT_RETENTION_MS } from "./chat/archive.js";

export {
  BoardVerseDb,
  BoardVerseDbV011,
  GameRoomV011,
  GameRoomV012,
  GameRoomV013,
  GameRoomV014,
  GameRoomV015,
  GameRoomV016,
  GlobalChatV011,
} from "./index-v016.js";

const ROOM_CHAT_MODERATION_TTL_MS = 15_000;
const GLOBAL_POLICY_TTL_MS = 60_000;
const GLOBAL_MUTE_TTL_MS = 15_000;
const GLOBAL_ARCHIVE_BATCH = 8;
const GLOBAL_ARCHIVE_FLUSH_MS = 30_000;

function cleanChatText(text) {
  return String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_CHAT_TEXT);
}

function moderationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export class GameRoom extends GameRoomBase {
  async assertRoomChatModeration(member) {
    const room = this.room;
    if (!room || !member || !this.env?.BOARDVERSE_DB) return;
    const bv = ensureFeatureState(room);
    const userId = bv.memberUsers?.[member.id] || member.userId || null;
    if (!userId || String(userId).startsWith("admin:")) return;

    if (!this._roomChatModerationCache) this._roomChatModerationCache = new Map();
    const now = Date.now();
    const key = String(userId);
    let cached = this._roomChatModerationCache.get(key);
    if (!cached || cached.expiresAt <= now) {
      const row = await this.env.BOARDVERSE_DB.prepare(`SELECT
        (SELECT status FROM users WHERE id=?) AS status,
        (SELECT suspended_until FROM users WHERE id=?) AS suspended_until,
        (SELECT MAX(muted_until) FROM chat_mutes WHERE subject_type='user' AND subject_id=? AND channel IN ('room','all')) AS muted_until`)
        .bind(key, key, key).first();
      const status = row?.status == null ? null : String(row.status);
      const suspendedUntil = Number(row?.suspended_until || 0);
      const mutedUntil = Number(row?.muted_until || 0);
      const restricted = !!status && status !== "active" && !(status === "suspended" && suspendedUntil > 0 && suspendedUntil <= now);
      cached = { restricted, mutedUntil, expiresAt: now + ROOM_CHAT_MODERATION_TTL_MS };
      this._roomChatModerationCache.set(key, cached);
    }
    if (cached.restricted) throw moderationError("帳號目前已停權、封禁或停用，不能使用房內聊天室。", "account_restricted");
    if (Number(cached.mutedUntil || 0) > now) throw moderationError("你目前被禁止在房內聊天室發言。", "chat_muted");
  }

  async persistRoomChatOnly() {
    if (!this.room) return;
    this.reconcileOfflineForfeits();
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put("room", this.room);
    await this.updateOfflineAlarm();
  }

  async handleChat(token, text) {
    const room = this.room;
    const auth = this.authToken(token);
    if (!room || !auth || auth.member.role === "pending") throw new Error("加入申請核准後才能使用聊天室。");
    const clean = cleanChatText(text);
    if (!clean) throw new Error("聊天訊息不能是空白。");

    await this.assertRoomChatModeration(auth.member);
    const bv = ensureFeatureState(room), now = Date.now();
    if (!bv.chatRate) bv.chatRate = {};
    const rec = bv.chatRate[auth.member.id] || { lastAt: 0, recent: [] };
    const channelSlow = auth.member.role === "player" ? bv.playerChatSlowMs : bv.spectatorChatSlowMs;
    const minimum = Math.max(1000, channelSlow || 0);
    if (now - Number(rec.lastAt || 0) < minimum) throw new Error("發言速度過快，請稍候。");
    rec.recent = Array.isArray(rec.recent) ? rec.recent.filter((x) => now - Number(x.at || 0) < 10_000) : [];
    if (rec.recent.length >= 5) throw new Error("短時間訊息過多。");
    if (rec.recent.filter((x) => x.text === clean).length >= 2) throw new Error("請勿重複洗版。");
    rec.lastAt = now;
    rec.recent.push({ at: now, text: clean });
    bv.chatRate[auth.member.id] = rec;

    const channel = auth.member.role === "player" ? "playerChat" : "spectatorChat";
    room.chatSeq = (Number(room.chatSeq) || 0) + 1;
    const entry = {
      id: room.chatSeq,
      memberId: auth.member.id,
      name: auth.member.name,
      role: auth.member.role,
      side: auth.member.side || null,
      text: clean,
      at: now,
    };
    if (!Array.isArray(room[channel])) room[channel] = [];
    room[channel].push(entry);
    if (room[channel].length > 100) room[channel] = room[channel].slice(-100);

    // Chat changes only the room-local chat stream. Do not write active_rooms and
    // do not ping the lobby Durable Object for every message.
    await this.persistRoomChatOnly();
    await this.broadcastState();
  }
}
export class GameRoomV017 extends GameRoom {}

function parseSetting(value, fallback) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}

export class GlobalChat extends GlobalChatBase {
  async globalPolicy(now = Date.now()) {
    if (this._globalPolicyCache && this._globalPolicyCache.expiresAt > now) return this._globalPolicyCache;
    let slowMs = 5000, enabled = true;
    if (this.env?.BOARDVERSE_DB) {
      const result = await this.env.BOARDVERSE_DB.prepare("SELECT key,value_json FROM system_settings WHERE key IN ('global_chat_slow_ms','global_chat_enabled')").all();
      for (const row of result?.results || []) {
        if (row.key === "global_chat_slow_ms") slowMs = Number(parseSetting(row.value_json, 5000)) || 5000;
        else if (row.key === "global_chat_enabled") enabled = parseSetting(row.value_json, true) !== false;
      }
    }
    const policy = { slowMs: Math.max(1200, Number(slowMs) || 5000), enabled, expiresAt: now + GLOBAL_POLICY_TTL_MS };
    this._globalPolicyCache = policy;
    return policy;
  }

  async globalMute(identity, now = Date.now()) {
    if (!identity || !this.env?.BOARDVERSE_DB) return 0;
    if (!this._globalMuteCache) this._globalMuteCache = new Map();
    const key = `${String(identity.kind || "guest")}:${String(identity.id || "")}`;
    const cached = this._globalMuteCache.get(key);
    if (cached && cached.expiresAt > now) return Number(cached.mutedUntil || 0);
    const row = await this.env.BOARDVERSE_DB.prepare("SELECT muted_until FROM chat_mutes WHERE subject_type=? AND subject_id=? AND channel='global'")
      .bind(identity.kind, identity.id).first();
    const mutedUntil = Number(row?.muted_until || 0);
    this._globalMuteCache.set(key, { mutedUntil, expiresAt: now + GLOBAL_MUTE_TTL_MS });
    return mutedUntil;
  }

  async scheduleArchiveFlush() {
    if (!this.env?.BOARDVERSE_DB) return;
    if (this._archiveAlarmSet) return;
    const current = await this.ctx.storage.getAlarm();
    if (current == null) await this.ctx.storage.setAlarm(Date.now() + GLOBAL_ARCHIVE_FLUSH_MS);
    this._archiveAlarmSet = true;
  }

  async flushArchive() {
    if (!this.env?.BOARDVERSE_DB) return;
    const messages = (await this.ctx.storage.get("messages")) || [];
    if (!Array.isArray(messages) || !messages.length) return;
    const cursor = await this.ctx.storage.get("chatArchiveCursorId");
    let start = 0;
    if (cursor) {
      const index = messages.findIndex((m) => String(m?.id || "") === String(cursor));
      start = index >= 0 ? index + 1 : 0;
    }
    const pending = messages.slice(start);
    if (!pending.length) return;

    for (let offset = 0; offset < pending.length; offset += GLOBAL_ARCHIVE_BATCH) {
      const batch = pending.slice(offset, offset + GLOBAL_ARCHIVE_BATCH);
      const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?)").join(",");
      const binds = [];
      for (const entry of batch) {
        const at = Number(entry?.at || Date.now());
        binds.push(
          String(entry?.id || crypto.randomUUID()), "global", null,
          String(entry?.senderKind || "guest"), entry?.senderId == null ? null : String(entry.senderId),
          String(entry?.name || "Guest").slice(0, 80), String(entry?.text || ""), at, at + CHAT_RETENTION_MS,
        );
      }
      await this.env.BOARDVERSE_DB.prepare(`INSERT OR IGNORE INTO chat_archive(id,channel,room_id,sender_kind,sender_id,sender_name,message_text,created_at,delete_after) VALUES ${placeholders}`)
        .bind(...binds).run();
      await this.ctx.storage.put("chatArchiveCursorId", String(batch[batch.length - 1]?.id || ""));
    }
    this._pendingArchiveCount = 0;
  }

  async queueArchiveFlush() {
    if (!this.env?.BOARDVERSE_DB) return;
    this._pendingArchiveCount = Number(this._pendingArchiveCount || 0) + 1;
    if (this._pendingArchiveCount >= GLOBAL_ARCHIVE_BATCH) {
      this._pendingArchiveCount = 0;
      this.ctx.waitUntil(this.flushArchive().catch(() => {}));
      return;
    }
    await this.scheduleArchiveFlush();
  }

  async alarm() {
    this._archiveAlarmSet = false;
    await this.flushArchive().catch(() => {});
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 8 * 1024) return;
    let msg; try { msg = JSON.parse(message); } catch { return; }
    if (msg.type !== "chat") return;
    const attachment = ws.deserializeAttachment() || {}, identity = attachment.identity;
    const text = cleanChatText(msg.text);
    if (!text || !identity) return;
    const now = Date.now();
    const policy = await this.globalPolicy(now);
    if (policy.enabled === false) { this.safeSend(ws, { type: "global_error", message: "全局聊天室目前暫停發言。" }); return; }
    if (now - Number(attachment.lastAt || 0) < policy.slowMs) { this.safeSend(ws, { type: "global_error", message: "發言速度過快，請稍候。" }); return; }
    const recent = Array.isArray(attachment.recent) ? attachment.recent.filter((x) => now - Number(x.at || 0) < 10_000) : [];
    if (recent.length >= 5) { this.safeSend(ws, { type: "global_error", message: "短時間訊息過多。" }); return; }
    if (recent.filter((x) => x.text === text).length >= 2) { this.safeSend(ws, { type: "global_error", message: "請勿重複洗版。" }); return; }
    if (Number(await this.globalMute(identity, now)) > now) { this.safeSend(ws, { type: "global_error", message: "你目前被禁止在全局聊天室發言。" }); return; }

    const badge = String(identity.badge || (identity.kind === "guest" ? "訪客" : "會員")).slice(0, 16);
    const rawName = String(identity.name || "Guest").slice(0, 40);
    const entry = {
      id: crypto.randomUUID(), senderId: identity.id, senderKind: identity.kind,
      name: `${badge} · ${rawName}`,
      rawName,
      role: String(identity.role || (identity.kind === "guest" ? "guest" : "member")),
      badge,
      level: Number.isFinite(Number(identity.level)) ? Number(identity.level) : null,
      text, at: now,
    };
    const messages = (await this.ctx.storage.get("messages")) || [];
    messages.push(entry);
    if (messages.length > 100) messages.splice(0, messages.length - 100);
    await this.ctx.storage.put("messages", messages);

    attachment.lastAt = now;
    attachment.recent = [...recent, { at: now, text }];
    ws.serializeAttachment(attachment);
    this.broadcast({ type: "global_chat", message: entry });
    await this.queueArchiveFlush();
  }
}
export class GlobalChatV017 extends GlobalChat {}

export default {
  fetch(request, env, ctx) {
    return appV016.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return appV016.scheduled(event, env, ctx);
  },
};
