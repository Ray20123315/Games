import app, {
  BoardVerseDb as AppBoardVerseDb,
  GameRoom as AppGameRoom,
  GlobalChat as AppGlobalChat,
} from "./index-v011.js";
import { appendEvent, ensureFeatureState, requireRevision, resetReady } from "./room/state.js";
import { assertOwner } from "./room/roles.js";
import { cancelDeadline } from "./room/deadline-scheduler.js";
import { parseWsMessage } from "./protocol/messages.js";

function memberById(room, id) {
  return room?.members?.find((member) => member.id === id) || null;
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

const HOST_KICK_SCRIPT = String.raw`<script id="boardverse-host-kick">
(function(){
'use strict';
var feature=null,panel=null,list=null;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function roleLabel(m){if(m.seated)return text('玩家','玩家','Player');if(m.role==='queued')return text('排隊','排队','Queued');if(m.role==='pending')return text('待核准','待批准','Pending');return text('觀戰','观战','Spectator')}
function ensurePanel(){if(panel&&document.body.contains(panel))return panel;var players=document.getElementById('players');if(!players)return null;panel=document.createElement('section');panel.id='bvHostKickPanel';panel.className='card hidden';panel.style.marginTop='12px';var title=document.createElement('div');title.style.cssText='font-weight:900;margin-bottom:8px';title.textContent=text('房主成員管理','房主成员管理','Host member controls');list=document.createElement('div');list.id='bvHostKickList';list.style.cssText='display:grid;gap:8px';panel.appendChild(title);panel.appendChild(list);players.insertAdjacentElement('afterend',panel);return panel}
function confirmKick(m){var phase=feature&&feature.status==='playing'?text('若此人正在對局，本局會以無結果終止。','若此人正在对局，本局会以无结果终止。','If this member is in the active game, the game will end with no result.'):'',q=text('確定要把「','确定要把“','Remove “')+m.name+text('」踢出房間嗎？','”踢出房间吗？','” from the room?');return window.confirm(q+(phase?'\n\n'+phase:''))}
function render(){var p=ensurePanel();if(!p)return;if(!feature||!feature.isOwner){p.classList.add('hidden');if(list)list.textContent='';return}p.classList.remove('hidden');list.textContent='';var members=Array.isArray(feature.kickableMembers)?feature.kickableMembers:[];if(!members.length){var empty=document.createElement('div');empty.className='small muted';empty.textContent=text('目前沒有可踢出的其他成員。','目前没有可踢出的其他成员。','There are no other members to remove.');list.appendChild(empty);return}members.forEach(function(m){var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px';var meta=document.createElement('div');var name=document.createElement('strong');name.textContent=m.name;var sub=document.createElement('div');sub.className='small muted';sub.textContent=roleLabel(m)+' · '+(m.connected?text('在線','在线','Online'):text('離線','离线','Offline'));meta.appendChild(name);meta.appendChild(sub);var kick=document.createElement('button');kick.type='button';kick.className='btn danger';kick.textContent=text('踢出','踢出','Kick');kick.addEventListener('click',function(){if(!feature||!confirmKick(m))return;var bridge=window.BoardVerseBridge;if(!bridge||typeof bridge.send!=='function')return;kick.disabled=true;bridge.send({type:'kick_member',memberId:m.id,revision:feature.revision});setTimeout(function(){kick.disabled=false},1200)});row.appendChild(meta);row.appendChild(kick);list.appendChild(row)})}
window.addEventListener('boardverse:feature',function(e){feature=e.detail;render()});
window.addEventListener('boardverse:language',render);
setTimeout(function(){try{feature=window.BoardVerseBridge&&window.BoardVerseBridge.feature();render()}catch(e){}},0);
})();
</script>`;

function injectHostKickScript(source) {
  if (source.includes('id="boardverse-host-kick"')) return source;
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${HOST_KICK_SCRIPT}</body>`);
  return source + HOST_KICK_SCRIPT;
}

export class BoardVerseDb extends AppBoardVerseDb {}
export class BoardVerseDbV012 extends BoardVerseDb {}

export class GameRoom extends AppGameRoom {
  send(ws, message) {
    let next = message;
    if (message?.type === "feature_state" && message.feature && this.room) {
      const token = (ws.deserializeAttachment?.() || {}).token || "";
      const viewer = this.room.members?.find((member) => member.token === token) || null;
      const isOwner = !!viewer && viewer.id === this.room.ownerId;
      const feature = { ...message.feature };
      feature.canKickMembers = isOwner;
      feature.kickableMembers = isOwner
        ? (this.room.members || []).filter((member) => member.id !== this.room.ownerId).map((member) => publicMember(this.room, member))
        : [];
      next = { ...message, feature };
    }
    return super.send(ws, next);
  }

  async webSocketMessage(ws, message) {
    let msg = null;
    try { msg = parseWsMessage(message); } catch { return super.webSocketMessage(ws, message); }
    if (msg.type !== "kick_member") return super.webSocketMessage(ws, message);

    await this.loadRoom();
    if (!this.room) return;
    const token = (ws.deserializeAttachment?.() || {}).token || "";
    const auth = this.authToken(token);
    if (!auth) {
      this.send(ws, { type: "error", code: "invalid_session", message: "工作階段已失效。" });
      return;
    }

    try {
      await this.kickMember(auth.member, msg);
    } catch (error) {
      this.send(ws, {
        type: "error",
        code: error?.code || "kick_failed",
        expectedRevision: error?.expectedRevision,
        message: error?.message || "踢出成員失敗。",
      });
      this.sendFeatureState(ws);
    }
  }

  async kickMember(owner, msg) {
    const room = this.room;
    if (!room) throw new Error("找不到此房間。");
    const bv = ensureFeatureState(room);
    requireRevision(room, msg.revision);
    assertOwner(room, owner);

    const target = memberById(room, String(msg.memberId || ""));
    if (!target) throw new Error("找不到要踢出的成員。");
    if (target.id === room.ownerId) throw new Error("房主不能踢出自己。");

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

    appendEvent(room, "player_kicked", {
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

export class GlobalChat extends AppGlobalChat {}
export class GlobalChatV012 extends GlobalChat {}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const body = injectHostKickScript(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, env, ctx);
  },
};
