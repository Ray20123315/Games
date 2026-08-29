import appV011, { GameRoom as GameRoomBase } from "./index-v011.js";
import { appendEvent, ensureFeatureState, requireRevision, resetReady } from "./room/state.js";
import { assertOwner } from "./room/roles.js";
import { cancelDeadline } from "./room/deadline-scheduler.js";
import { parseWsMessage } from "./protocol/messages.js";
import { ROOM_CODE_RE } from "./core/config.js";
import { audit, withDatabaseEnv } from "./core/db.js";
import { errorJson, json, toErrorResponse } from "./core/http.js";
import { requireAdmin } from "./admin/auth.js";
import { archiveChatMessage, cleanupChatArchive, listChatArchive } from "./chat/archive.js";

export { BoardVerseDb, BoardVerseDbV011, GameRoomV011, GlobalChat, GlobalChatV011 } from "./index-v011.js";

const MAX_ROOM_ANNOUNCEMENT = 500;

function memberById(room, id) {
  return room?.members?.find((member) => member.id === id) || null;
}

function memberByToken(room, token) {
  return room?.members?.find((member) => member.token === token) || null;
}

function publicMember(room, member) {
  if (!member) return null;
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    connected: !!member.connected,
    seated: !!room?.seats?.includes(member.id),
    seat: room?.seats?.indexOf(member.id) ?? -1,
  };
}

function cleanRoomIds(values) {
  const source = Array.isArray(values) ? values : [];
  const roomIds = [...new Set(source.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
  if (!roomIds.length) throw Object.assign(new Error("請至少選擇一個房間。"), { status: 400, code: "room_ids_required" });
  if (roomIds.length > 50) throw Object.assign(new Error("一次最多可設定 50 個房間公告。"), { status: 400, code: "room_ids_limit" });
  for (const roomId of roomIds) {
    if (!ROOM_CODE_RE.test(roomId)) throw Object.assign(new Error(`房號格式錯誤：${roomId}`), { status: 400, code: "room_invalid" });
  }
  return roomIds;
}

function cleanAnnouncementText(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (text.length > MAX_ROOM_ANNOUNCEMENT) throw Object.assign(new Error(`房內公告最多 ${MAX_ROOM_ANNOUNCEMENT} 字。`), { status: 400, code: "announcement_too_long" });
  return text;
}

const ROOM_UI_STYLE = String.raw`<style id="boardverse-room-controls-style">
@keyframes bvAdminAnnouncementPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,0);border-color:#8a6a00}50%{box-shadow:0 0 0 5px rgba(212,175,55,.28),0 0 30px rgba(212,175,55,.2);border-color:#f0d36a}}
#bvRoomAnnouncement.bv-announcement-flash{animation:bvAdminAnnouncementPulse .7s ease-in-out 4}
#bvRoomAnnouncementOverlay{position:fixed;z-index:30000;inset:0;display:none;place-items:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(5px)}
#bvRoomAnnouncementOverlay.show{display:grid}
#bvRoomAnnouncementDialog{width:min(520px,94vw);max-height:80vh;overflow:auto;padding:20px;border:1px solid #9d7b1d;border-radius:18px;background:#14120c;color:#f7eab4;box-shadow:0 24px 80px rgba(0,0,0,.62)}
#bvRoomAnnouncementDialog h3{margin:0 0 10px;color:#f0d36a;font-size:18px}#bvRoomAnnouncementDialog p{margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.65}
#bvRoomAnnouncementDialog .actions{display:flex;justify-content:flex-end;margin-top:16px}
#bvRoomAnnouncementChat .chat-bubble{border-color:#8a6a00!important;background:#211b0d!important;color:#f8e7a7!important}
#bvRoomAnnouncementChat .chat-meta{color:#d4af37!important;font-weight:800}
</style>`;

const ROOM_UI_SCRIPT = String.raw`<script id="boardverse-room-controls">
(function(){
'use strict';
var feature=null,lastAnnouncementAt=0;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function ensureKickPanel(){var players=document.getElementById('players');if(!players)return null;var panel=document.getElementById('bvHostKickPanel');if(panel)return panel;panel=document.createElement('section');panel.id='bvHostKickPanel';panel.className='setup hidden';panel.style.marginTop='12px';players.parentNode.insertBefore(panel,players.nextSibling);return panel}
function roleText(m){if(m.seated)return text('玩家','玩家','Player');if(m.role==='queued')return text('排隊','排队','Queued');if(m.role==='pending')return text('待審核','待审核','Pending');return text('觀眾','观众','Spectator')}
function syncKick(next){feature=next||feature;var panel=ensureKickPanel();if(!panel)return;var members=feature&&feature.isOwner&&Array.isArray(feature.kickableMembers)?feature.kickableMembers:[];if(!feature||!feature.isOwner){panel.classList.add('hidden');panel.textContent='';return}panel.classList.remove('hidden');panel.textContent='';var title=document.createElement('strong');title.textContent=text('房主管理','房主管理','Host controls');panel.appendChild(title);var hint=document.createElement('div');hint.className='small muted';hint.style.margin='6px 0 10px';hint.textContent=text('可在遊戲開始前、進行中或結束後踢出成員。進行中踢出在席玩家會將該局以無結果終止。','可在游戏开始前、进行中或结束后踢出成员。进行中踢出在席玩家会将该局以无结果终止。','Members can be kicked before, during, or after a game. Kicking a seated player during play ends that game with no result.');panel.appendChild(hint);if(!members.length){var empty=document.createElement('div');empty.className='small muted';empty.textContent=text('目前沒有可踢出的其他成員。','目前没有可踢出的其他成员。','There are no other members to remove.');panel.appendChild(empty);return}members.forEach(function(m){var row=document.createElement('div');row.className='queue-row';row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='10px';var label=document.createElement('span');label.textContent=m.name+' · '+roleText(m)+' · '+(m.connected?text('在線','在线','online'):text('離線','离线','offline'));var button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent=text('踢出','踢出','Kick');button.addEventListener('click',function(){if(!feature)return;var phase=feature.status==='playing'&&m.seated?'\n\n'+text('此玩家正在對局，本局會以無結果終止。','此玩家正在对局，本局会以无结果终止。','This player is in the active game; the game will end with no result.'):'';var confirmText=text('確定要將「'+m.name+'」踢出房間嗎？','确定要将“'+m.name+'”踢出房间吗？','Kick “'+m.name+'” from the room?')+phase;if(!window.confirm(confirmText))return;var bridge=window.BoardVerseBridge;if(!bridge||typeof bridge.send!=='function')return;button.disabled=true;var sent=bridge.send({type:'host_kick',memberId:m.id,revision:feature.revision});if(!sent){button.disabled=false;window.alert(text('目前無法送出踢人指令。','目前无法送出踢人指令。','Unable to send the kick command right now.'));return}setTimeout(function(){button.disabled=false},1200)});row.appendChild(label);row.appendChild(button);panel.appendChild(row)})}
function ensureAnnouncement(){var title=document.getElementById('roomTitle');if(!title)return null;var node=document.getElementById('bvRoomAnnouncement');if(node)return node;node=document.createElement('aside');node.id='bvRoomAnnouncement';node.setAttribute('role','status');node.style.cssText='display:none;margin:10px 0 14px;padding:12px 14px;border:1px solid #8a6a00;border-radius:12px;background:#211b0d;color:#f8e7a7;line-height:1.55;white-space:pre-wrap;word-break:break-word';var anchor=title.parentElement||title;anchor.parentNode.insertBefore(node,anchor.nextSibling);return node}
function ensureModal(){var overlay=document.getElementById('bvRoomAnnouncementOverlay');if(overlay)return overlay;overlay=document.createElement('div');overlay.id='bvRoomAnnouncementOverlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');var dialog=document.createElement('div');dialog.id='bvRoomAnnouncementDialog';var h=document.createElement('h3');h.textContent=text('ADMIN 房內公告','ADMIN 房内公告','ADMIN room announcement');var p=document.createElement('p');p.id='bvRoomAnnouncementModalText';var actions=document.createElement('div');actions.className='actions';var ok=document.createElement('button');ok.type='button';ok.className='btn';ok.textContent=text('知道了','知道了','OK');ok.addEventListener('click',function(){overlay.classList.remove('show')});actions.appendChild(ok);dialog.appendChild(h);dialog.appendChild(p);dialog.appendChild(actions);overlay.appendChild(dialog);overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.classList.remove('show')});document.body.appendChild(overlay);return overlay}
function showPopup(content){var overlay=ensureModal(),p=document.getElementById('bvRoomAnnouncementModalText');if(p)p.textContent=content;overlay.classList.add('show')}
function flashBanner(node){node.classList.remove('bv-announcement-flash');void node.offsetWidth;node.classList.add('bv-announcement-flash');setTimeout(function(){node.classList.remove('bv-announcement-flash')},3200)}
function chatReminder(content,at){var list=document.getElementById('chatList');if(!list)return;var old=document.getElementById('bvRoomAnnouncementChat');if(old)old.remove();var wrap=document.createElement('div');wrap.id='bvRoomAnnouncementChat';wrap.className='chat-msg';var meta=document.createElement('div');meta.className='chat-meta';meta.textContent=text('ADMIN 房內公告','ADMIN 房内公告','ADMIN room announcement')+' · '+new Date(at||Date.now()).toLocaleTimeString(lang()==='en'?'en-US':lang()==='zh-Hans'?'zh-CN':'zh-TW',{hour:'2-digit',minute:'2-digit'});var bubble=document.createElement('div');bubble.className='chat-bubble';bubble.textContent=content;wrap.appendChild(meta);wrap.appendChild(bubble);list.appendChild(wrap);list.scrollTop=list.scrollHeight}
function syncAnnouncement(next){feature=next||feature;var node=ensureAnnouncement();if(!node)return;var item=feature&&feature.roomAnnouncement;var content=item&&String(item.text||'').trim();if(!content){node.style.display='none';node.textContent='';var old=document.getElementById('bvRoomAnnouncementChat');if(old)old.remove();return}node.style.display='block';node.textContent=text('ADMIN 房內公告：','ADMIN 房内公告：','ADMIN room announcement: ') + content;chatReminder(content,item.updatedAt);var stamp=Number(item.updatedAt||0);if(stamp&&stamp!==lastAnnouncementAt){lastAnnouncementAt=stamp;flashBanner(node);showPopup(content)}}
function sync(next){feature=next||feature;syncKick(feature);syncAnnouncement(feature)}
window.addEventListener('boardverse:feature',function(e){sync(e.detail)});
window.addEventListener('boardverse:language',function(){sync(feature)});
setTimeout(function(){try{sync(window.BoardVerseBridge&&window.BoardVerseBridge.feature())}catch(e){}},0);
})();
</script>`;

const ADMIN_UI_STYLE = String.raw`<style id="boardverse-admin-scroll-fix">
html,body{height:auto!important;min-height:100%!important;overflow:auto!important}
body{display:block!important;place-items:initial!important}
.admin-frame{height:auto!important;min-height:max(100dvh,518px)!important;overflow:visible!important;margin:0 auto}
.workspace{min-height:calc(100dvh - 130px)!important}
.content-grid{min-height:560px}
#bvRoomAnnouncementControls{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
#bvRoomAnnouncementText{min-width:260px;max-width:430px}
@media(max-width:1100px){#bvRoomAnnouncementText{min-width:200px}}
</style>`;

const ADMIN_UI_SCRIPT = String.raw`<script id="boardverse-admin-room-announcement">
(function(){
'use strict';
function selectedRoomIds(){return Array.from(document.querySelectorAll('[data-room-check][aria-checked="true"]')).map(function(n){return n.getAttribute('data-room-check')}).filter(Boolean)}
function api(path,body){return fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().catch(function(){return{message:'Invalid response'}}).then(function(d){if(!r.ok)throw new Error(d.message||'Request failed');return d})})}
function mount(){var toolbar=document.getElementById('toolbar');if(!toolbar||!document.getElementById('roomSelectAll')||document.getElementById('bvRoomAnnouncementControls'))return;var wrap=document.createElement('div');wrap.id='bvRoomAnnouncementControls';var input=document.createElement('input');input.id='bvRoomAnnouncementText';input.className='input';input.maxLength=500;input.placeholder='房內公告（最多 500 字）';input.setAttribute('aria-label','房內公告');var send=document.createElement('button');send.type='button';send.className='btn gold';send.textContent='發送公告';var clear=document.createElement('button');clear.type='button';clear.className='btn';clear.textContent='清除公告';function run(textValue){var ids=selectedRoomIds();if(!ids.length){window.alert('請先選擇至少一個房間。');return}send.disabled=true;clear.disabled=true;api('/admin/api/rooms/announcement',{roomIds:ids,text:textValue}).then(function(d){window.alert((textValue?'公告已發送到 ':'公告已清除：')+d.succeeded+' 個房間');if(textValue)input.value=''}).catch(function(e){window.alert(e.message)}).finally(function(){send.disabled=false;clear.disabled=false})}send.addEventListener('click',function(){var value=String(input.value||'').trim();if(!value){input.focus();return}run(value)});clear.addEventListener('click',function(){if(!window.confirm('確定清除所選房間目前的房內公告？'))return;run('')});wrap.appendChild(input);wrap.appendChild(send);wrap.appendChild(clear);toolbar.appendChild(wrap)}
var observer=new MutationObserver(mount);observer.observe(document.documentElement,{subtree:true,childList:true});mount();
})();
</script>`;

function injectRoomUi(source) {
  let next = source;
  if (!next.includes('id="boardverse-room-controls-style"')) {
    if (/<\/head>/i.test(next)) next = next.replace(/<\/head>/i, `${ROOM_UI_STYLE}</head>`);
    else next = ROOM_UI_STYLE + next;
  }
  if (!next.includes('id="boardverse-room-controls"')) {
    if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${ROOM_UI_SCRIPT}</body>`);
    else next += ROOM_UI_SCRIPT;
  }
  return next;
}

function injectAdminUi(source) {
  let next = source;
  if (!next.includes('id="boardverse-admin-scroll-fix"')) {
    if (/<\/head>/i.test(next)) next = next.replace(/<\/head>/i, `${ADMIN_UI_STYLE}</head>`);
    else next = ADMIN_UI_STYLE + next;
  }
  if (!next.includes('id="boardverse-admin-room-announcement"')) {
    if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${ADMIN_UI_SCRIPT}</body>`);
    else next += ADMIN_UI_SCRIPT;
  }
  return next;
}

export class GameRoom extends GameRoomBase {
  send(ws, message) {
    let next = message;
    if (message?.type === "feature_state" && message.feature && this.room) {
      const token = (ws.deserializeAttachment?.() || {}).token || "";
      const viewer = this.room.members?.find((member) => member.token === token) || null;
      const isOwner = !!viewer && viewer.id === this.room.ownerId;
      const feature = { ...message.feature };
      feature.kickableMembers = isOwner
        ? (this.room.members || []).filter((member) => member.id !== this.room.ownerId).map((member) => publicMember(this.room, member))
        : [];
      const announcement = ensureFeatureState(this.room).roomAnnouncement;
      feature.roomAnnouncement = announcement?.text ? {
        text: String(announcement.text),
        updatedAt: Number(announcement.updatedAt || 0),
      } : null;
      next = { ...message, feature };
    }
    return super.send(ws, next);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/admin/room-announcement" && request.method === "POST") {
      await this.loadRoom();
      if (!this.room) return errorJson("找不到此房間。", 404, "room_not_found");
      const body = await request.json().catch(() => ({}));
      const text = cleanAnnouncementText(body.text);
      const actor = String(body.actor || "admin").slice(0, 80);
      const bv = ensureFeatureState(this.room);
      bv.roomAnnouncement = text ? { text, updatedAt: Date.now(), actor } : null;
      appendEvent(this.room, text ? "admin_room_announcement_set" : "admin_room_announcement_cleared", { admin: true, name: actor }, text ? { text } : null);
      await this.saveRoom();
      await this.broadcastState();
      return json({ ok: true, roomId: this.room.id, announcement: bv.roomAnnouncement });
    }
    return super.fetch(request);
  }

  async handleChat(token, text) {
    const room = this.room;
    const member = memberByToken(room, token);
    const result = await super.handleChat(token, text);
    if (this.env?.BOARDVERSE_DB && room && member) {
      const bv = ensureFeatureState(room);
      const userId = bv.memberUsers?.[member.id] || member.userId || null;
      await archiveChatMessage(this.env.BOARDVERSE_DB, {
        channel: "room",
        roomId: room.id,
        senderKind: userId ? "user" : "guest",
        senderId: userId || member.id,
        senderName: member.name,
        text,
        createdAt: Date.now(),
      }).catch(() => {});
    }
    return result;
  }

  async webSocketMessage(ws, message) {
    let msg;
    try { msg = parseWsMessage(message); } catch { return super.webSocketMessage(ws, message); }
    if (msg.type !== "host_kick") return super.webSocketMessage(ws, message);

    await this.loadRoom();
    if (!this.room) return;
    const token = (ws.deserializeAttachment?.() || {}).token || "";
    const auth = this.authToken(token);
    if (!auth) {
      this.send(ws, { type: "error", code: "invalid_session", message: "工作階段已失效。" });
      return;
    }

    try {
      await this.hostKickMember(auth.member, msg);
    } catch (error) {
      this.send(ws, {
        type: "error",
        code: error?.code || "host_kick_failed",
        expectedRevision: error?.expectedRevision,
        message: error?.message || "踢出成員失敗。",
      });
      this.sendFeatureState(ws);
    }
  }

  async hostKickMember(owner, msg) {
    const room = this.room;
    if (!room) throw new Error("找不到此房間。");
    const bv = ensureFeatureState(room);
    requireRevision(room, msg.revision);
    assertOwner(room, owner);

    const target = memberById(room, String(msg.memberId || ""));
    if (!target) {
      const error = new Error("找不到要踢出的房間成員。");
      error.code = "member_not_found";
      throw error;
    }
    if (target.id === room.ownerId) {
      const error = new Error("房主不能踢出自己。");
      error.code = "invalid_kick_target";
      throw error;
    }

    const targetSnapshot = publicMember(room, target);
    const previousStatus = room.status;
    const wasSeated = !!room.seats?.includes(target.id);
    const wasPlaying = previousStatus === "playing" && wasSeated;
    const oldToken = target.token;

    if (wasPlaying) {
      const queueEnabled = !!room.settings?.queueEnabled;
      if (room.settings) room.settings.queueEnabled = false;
      try {
        await this.finishMatch({
          winner: null,
          winnerMemberId: null,
          winnerName: null,
          loserMemberId: null,
          loserName: null,
          reason: `房主踢出 ${target.name}，本局無結果`,
          adminTerminated: true,
          hostTerminated: true,
        });
      } finally {
        if (room.settings) room.settings.queueEnabled = queueEnabled;
      }
    }

    room.pending = (room.pending || []).filter((id) => id !== target.id);
    room.queue = (room.queue || []).filter((id) => id !== target.id);
    room.rematchVotes = (room.rematchVotes || []).filter((id) => id !== target.id);
    room.seats = (room.seats || []).map((id) => id === target.id ? null : id);

    if (bv.pendingUndo && (bv.pendingUndo.requesterId === target.id || bv.pendingUndo.targetMemberId === target.id)) bv.pendingUndo = null;
    if (bv.pendingRematch) {
      const referencesTarget = bv.pendingRematch.requesterId === target.id
        || (bv.pendingRematch.requiredIds || []).includes(target.id)
        || (bv.pendingRematch.acceptedIds || []).includes(target.id);
      if (referencesTarget) bv.pendingRematch = null;
    }
    delete bv.ready?.[target.id];
    delete bv.memberUsers?.[target.id];
    if (bv.chatRate) delete bv.chatRate[target.id];
    cancelDeadline(bv, `offline:${target.id}`);
    this.clearOfflineForfeit(target);
    room.members = (room.members || []).filter((member) => member.id !== target.id);

    if (wasSeated) {
      room.status = "waiting";
      room.opening = null;
      room.result = null;
      room.startedAt = null;
      room.endedAt = null;
      room.rematchVotes = [];
      bv.pendingUndo = null;
      bv.pendingRematch = null;
      bv.lastUndoSnapshot = null;
      bv.clock = null;
      bv.gameStartedAt = null;
      cancelDeadline(bv, "clock");
      this.promoteQueuedPlayers();
      resetReady(room, false);
    }

    appendEvent(room, "member_kicked", {
      memberId: owner.id,
      name: owner.name,
      side: owner.side || null,
    }, {
      target: targetSnapshot,
      previousStatus,
      wasSeated,
      interruptedGame: wasPlaying,
    });

    this.endTokenSession(oldToken, "你已被房主踢出房間。");
    await this.saveRoom();
    await this.updateOfflineAlarm();
    await this.syncLobby();
    await this.broadcastState();
  }

  promoteQueuedPlayers() {
    const room = this.room;
    if (!room?.settings?.queueEnabled || !Array.isArray(room.queue) || !Array.isArray(room.seats)) return;
    while (room.queue.length && room.seats.some((id) => !id)) {
      const memberId = room.queue.shift();
      const member = memberById(room, memberId);
      if (!member || member.role !== "queued") continue;
      const seatIndex = room.seats.findIndex((id) => !id);
      if (seatIndex < 0) break;
      this.assignSeat(member, seatIndex);
      this.sendToToken(member.token, {
        type: "queue_turn",
        roomId: room.id,
        roomName: room.name,
        side: member.side,
      });
    }
  }
}

export class GameRoomV012 extends GameRoom {}

async function adminRoomAnnouncement(request, env) {
  const effectiveEnv = withDatabaseEnv(env);
  if (!effectiveEnv?.BOARDVERSE_DB) return errorJson("資料庫尚未設定。", 503, "database_unavailable");
  if (!effectiveEnv?.ROOMS) return errorJson("ROOMS Durable Object 尚未綁定。", 503, "rooms_unavailable");
  const admin = await requireAdmin(effectiveEnv, request);
  const body = await request.json().catch(() => ({}));
  const roomIds = cleanRoomIds(body.roomIds);
  const text = cleanAnnouncementText(body.text);
  const results = [];
  for (const roomId of roomIds) {
    try {
      const response = await effectiveEnv.ROOMS.getByName(roomId).fetch(new Request("https://boardverse.internal/admin/room-announcement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, actor: admin.user }),
      }));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "房間公告操作失敗。");
      results.push({ roomId, ok: true });
    } catch (error) {
      results.push({ roomId, ok: false, message: String(error?.message || error) });
    }
  }
  const succeeded = results.filter((item) => item.ok).length;
  const failed = results.length - succeeded;
  await audit(effectiveEnv.BOARDVERSE_DB, text ? "room.announcement_set" : "room.announcement_clear", {
    adminActor: admin.user,
    targetType: "room",
    targetId: roomIds.join(","),
    reason: text ? text.slice(0, 500) : "clear room announcement",
    after: { roomIds, text, succeeded, failed },
  });
  return json({ ok: failed === 0, requested: roomIds.length, succeeded, failed, results });
}

async function adminChatArchive(request, env) {
  const effectiveEnv = withDatabaseEnv(env);
  if (!effectiveEnv?.BOARDVERSE_DB) return errorJson("資料庫尚未設定。", 503, "database_unavailable");
  await requireAdmin(effectiveEnv, request);
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const roomId = url.searchParams.get("roomId");
  if (roomId && !ROOM_CODE_RE.test(String(roomId).toUpperCase())) return errorJson("房號格式錯誤。", 400, "room_invalid");
  const items = await listChatArchive(effectiveEnv.BOARDVERSE_DB, {
    channel,
    roomId: roomId ? String(roomId).toUpperCase() : null,
    q: url.searchParams.get("q") || "",
    limit: Number(url.searchParams.get("limit")) || 100,
    offset: Number(url.searchParams.get("offset")) || 0,
  });
  return json({ ok: true, retentionDays: 60, items });
}

export default {
  async fetch(request, env, ctx) {
    const originalUrl = new URL(request.url);
    if (originalUrl.pathname === "/admin/api/rooms/announcement" && request.method === "POST") {
      try { return await adminRoomAnnouncement(request, env); }
      catch (error) { return toErrorResponse(error); }
    }
    if (originalUrl.pathname === "/admin/api/chat-archive" && request.method === "GET") {
      try { return await adminChatArchive(request, env); }
      catch (error) { return toErrorResponse(error); }
    }

    let routedRequest = request;
    const requestUrl = new URL(request.url);
    if (request.method === "GET" && requestUrl.pathname === "/admin") {
      requestUrl.pathname = "/admin/";
      routedRequest = new Request(requestUrl, request);
    }
    const response = await appV011.fetch(routedRequest, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    let body = await response.text();
    const routedPath = new URL(routedRequest.url).pathname;
    if (routedPath.startsWith("/admin")) body = injectAdminUi(body);
    else body = injectRoomUi(body);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(event, env, ctx) {
    await appV011.scheduled(event, env, ctx);
    const effectiveEnv = withDatabaseEnv(env);
    if (effectiveEnv?.BOARDVERSE_DB) await cleanupChatArchive(effectiveEnv.BOARDVERSE_DB, Date.now()).catch(() => {});
  },
};
