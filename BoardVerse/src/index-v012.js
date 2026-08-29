import appV011, { GameRoom as GameRoomBase } from "./index-v011.js";
import { appendEvent, ensureFeatureState, requireRevision, resetReady } from "./room/state.js";
import { assertOwner } from "./room/roles.js";
import { cancelDeadline } from "./room/deadline-scheduler.js";
import { parseWsMessage } from "./protocol/messages.js";

export { BoardVerseDb, BoardVerseDbV011, GameRoomV011, GlobalChat, GlobalChatV011 } from "./index-v011.js";

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
var feature=null;
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function ensurePanel(){var players=document.getElementById('players');if(!players)return null;var panel=document.getElementById('bvHostKickPanel');if(panel)return panel;panel=document.createElement('section');panel.id='bvHostKickPanel';panel.className='setup hidden';panel.style.marginTop='12px';players.parentNode.insertBefore(panel,players.nextSibling);return panel}
function roleText(m){if(m.seated)return text('玩家','玩家','Player');if(m.role==='queued')return text('排隊','排队','Queued');if(m.role==='pending')return text('待審核','待审核','Pending');return text('觀眾','观众','Spectator')}
function sync(next){feature=next||feature;var panel=ensurePanel();if(!panel)return;var members=feature&&feature.isOwner&&Array.isArray(feature.kickableMembers)?feature.kickableMembers:[];if(!feature||!feature.isOwner){panel.classList.add('hidden');panel.textContent='';return}panel.classList.remove('hidden');panel.textContent='';var title=document.createElement('strong');title.textContent=text('房主管理','房主管理','Host controls');panel.appendChild(title);var hint=document.createElement('div');hint.className='small muted';hint.style.margin='6px 0 10px';hint.textContent=text('可在遊戲開始前、進行中或結束後踢出成員。進行中踢出在席玩家會將該局以無結果終止。','可在游戏开始前、进行中或结束后踢出成员。进行中踢出在席玩家会将该局以无结果终止。','Members can be kicked before, during, or after a game. Kicking a seated player during play ends that game with no result.');panel.appendChild(hint);if(!members.length){var empty=document.createElement('div');empty.className='small muted';empty.textContent=text('目前沒有可踢出的其他成員。','目前没有可踢出的其他成员。','There are no other members to remove.');panel.appendChild(empty);return}members.forEach(function(m){var row=document.createElement('div');row.className='queue-row';row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='10px';var label=document.createElement('span');label.textContent=m.name+' · '+roleText(m)+' · '+(m.connected?text('在線','在线','online'):text('離線','离线','offline'));var button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent=text('踢出','踢出','Kick');button.addEventListener('click',function(){if(!feature)return;var phase=feature.status==='playing'&&m.seated?'\n\n'+text('此玩家正在對局，本局會以無結果終止。','此玩家正在对局，本局会以无结果终止。','This player is in the active game; the game will end with no result.'):'';var confirmText=text('確定要將「'+m.name+'」踢出房間嗎？','确定要将“'+m.name+'”踢出房间吗？','Kick “'+m.name+'” from the room?')+phase;if(!window.confirm(confirmText))return;var bridge=window.BoardVerseBridge;if(!bridge||typeof bridge.send!=='function')return;button.disabled=true;var sent=bridge.send({type:'host_kick',memberId:m.id,revision:feature.revision});if(!sent){button.disabled=false;window.alert(text('目前無法送出踢人指令。','目前无法送出踢人指令。','Unable to send the kick command right now.'));return}setTimeout(function(){button.disabled=false},1200)});row.appendChild(label);row.appendChild(button);panel.appendChild(row)})}
window.addEventListener('boardverse:feature',function(e){sync(e.detail)});
window.addEventListener('boardverse:language',function(){sync(feature)});
setTimeout(function(){try{sync(window.BoardVerseBridge&&window.BoardVerseBridge.feature())}catch(e){}},0);
})();
</script>`;

function injectHostKickScript(source) {
  if (source.includes('id="boardverse-host-kick"')) return source;
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${HOST_KICK_SCRIPT}</body>`);
  return source + HOST_KICK_SCRIPT;
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
      next = { ...message, feature };
    }
    return super.send(ws, next);
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

export default {
  async fetch(request, env, ctx) {
    let routedRequest = request;
    const requestUrl = new URL(request.url);
    if (request.method === "GET" && requestUrl.pathname === "/admin") {
      requestUrl.pathname = "/admin/";
      routedRequest = new Request(requestUrl, request);
    }
    const response = await appV011.fetch(routedRequest, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const body = injectHostKickScript(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return appV011.scheduled(event, env, ctx);
  },
};
