import appV011, { GameRoom as GameRoomV011 } from "./index-v011.js";
import { ensureFeatureState, appendEvent, resetReady } from "./room/state.js";

export { BoardVerseDb, BoardVerseDbV011, GlobalChat, GlobalChatV011 } from "./index-v011.js";

const HOST_KICK_SCRIPT = `<script id="boardverse-host-kick">(function(){
'use strict';
function lang(){try{return localStorage.getItem('boardverseLang')||'zh-Hant'}catch(e){return 'zh-Hant'}}
function text(h,s,e){return lang()==='en'?e:lang()==='zh-Hans'?s:h}
function ensurePanel(){
  var players=document.getElementById('players');
  if(!players)return null;
  var panel=document.getElementById('bvHostKickPanel');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='bvHostKickPanel';
  panel.className='setup hidden';
  panel.style.marginTop='12px';
  players.parentNode.insertBefore(panel,players.nextSibling);
  return panel;
}
function roleText(role){
  if(role==='player')return text('玩家','玩家','Player');
  if(role==='spectator')return text('觀眾','观众','Spectator');
  if(role==='queued')return text('排隊','排队','Queued');
  if(role==='pending')return text('待審核','待审核','Pending');
  return String(role||'');
}
function sync(feature){
  var panel=ensurePanel();
  if(!panel)return;
  var members=feature&&feature.isOwner&&Array.isArray(feature.kickableMembers)?feature.kickableMembers:[];
  if(!feature||!feature.isOwner||!members.length){panel.classList.add('hidden');panel.textContent='';return}
  panel.classList.remove('hidden');
  panel.textContent='';
  var title=document.createElement('strong');
  title.textContent=text('房主管理','房主管理','Host controls');
  panel.appendChild(title);
  var hint=document.createElement('div');
  hint.className='small muted';
  hint.style.margin='6px 0 10px';
  hint.textContent=text('可在遊戲開始前、進行中或結束後踢出成員。進行中踢出在席玩家會先安全終止該局。','可在游戏开始前、进行中或结束后踢出成员。进行中踢出在席玩家会先安全终止该局。','Members can be kicked before, during, or after a game. Kicking a seated player during play safely terminates that game first.');
  panel.appendChild(hint);
  members.forEach(function(m){
    var row=document.createElement('div');
    row.className='queue-row';
    row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='10px';
    var label=document.createElement('span');
    label.textContent=m.name+' · '+roleText(m.role)+(m.seated?' · '+text('在席','在席','seated'):'')+' · '+(m.connected?text('在線','在线','online'):text('離線','离线','offline'));
    var button=document.createElement('button');
    button.type='button';button.className='btn ghost';button.textContent=text('踢出','踢出','Kick');
    button.addEventListener('click',function(){
      var msg=text('確定要將「'+m.name+'」踢出房間嗎？','确定要将“'+m.name+'”踢出房间吗？','Kick “'+m.name+'” from the room?');
      if(!confirm(msg))return;
      if(!window.BoardVerseBridge||!window.BoardVerseBridge.send({type:'host_kick',memberId:m.id}))alert(text('目前無法送出踢人指令。','目前无法送出踢人指令。','Unable to send the kick command right now.'));
    });
    row.appendChild(label);row.appendChild(button);panel.appendChild(row);
  });
}
window.addEventListener('boardverse:feature',function(e){sync(e.detail)});
setTimeout(function(){try{sync(window.BoardVerseBridge&&window.BoardVerseBridge.feature())}catch(e){}},0);
})();</script>`;

function injectHostKickScript(source) {
  if (source.includes('id="boardverse-host-kick"')) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${HOST_KICK_SCRIPT}</head>`);
  return HOST_KICK_SCRIPT + source;
}

function memberById(room, id) {
  return room?.members?.find((member) => member.id === id) || null;
}

export class GameRoom extends GameRoomV011 {
  send(ws, message) {
    let next = message;
    if (message?.type === "feature_state" && message.feature) {
      const feature = { ...message.feature };
      feature.kickableMembers = feature.isOwner
        ? (this.room?.members || [])
            .filter((member) => member.id !== this.room?.ownerId)
            .map((member) => ({
              id: member.id,
              name: member.name,
              role: member.role,
              connected: !!member.connected,
              seated: !!this.room?.seats?.includes(member.id),
            }))
        : [];
      next = { ...message, feature };
    }
    return super.send(ws, next);
  }

  async webSocketMessage(ws, message) {
    let msg = null;
    try { msg = JSON.parse(String(message || "")); } catch {}
    if (msg?.type !== "host_kick") return super.webSocketMessage(ws, message);

    await this.loadRoom();
    const token = (ws.deserializeAttachment?.() || {}).token || "";
    const auth = this.authToken(token);
    if (!this.room || !auth?.isOwner) {
      this.send(ws, { type: "error", code: "owner_required", message: "只有房主可以踢出房間成員。" });
      return;
    }

    try {
      await this.hostKickMember(auth.member, String(msg.memberId || ""));
    } catch (error) {
      this.send(ws, { type: "error", code: error?.code || "host_kick_failed", message: error?.message || "踢出成員失敗。" });
      this.sendFeatureState(ws);
    }
  }

  async hostKickMember(owner, memberId) {
    const room = this.room;
    const target = memberById(room, memberId);
    if (!target) {
      const error = new Error("找不到要踢出的房間成員。");
      error.code = "member_not_found";
      throw error;
    }
    if (owner.id !== room.ownerId || target.id === room.ownerId) {
      const error = new Error("房主不能踢出自己。");
      error.code = "invalid_kick_target";
      throw error;
    }

    const bv = ensureFeatureState(room);
    const wasSeated = Array.isArray(room.seats) && room.seats.includes(target.id);
    const kickReason = `房主將 ${target.name} 踢出房間`;

    if (room.status === "playing" && wasSeated) {
      appendEvent(room, "host_kick_game_terminated", { memberId: owner.id, name: owner.name }, { targetMemberId: target.id, targetName: target.name });
      await this.finishMatch({ winner: null, reason: kickReason, adminTerminated: true });
    }

    this.sendToToken(target.token, { type: "session_end", message: `你已被房主踢出房間。` });

    room.seats = (room.seats || []).map((id) => id === target.id ? null : id);
    room.pending = (room.pending || []).filter((id) => id !== target.id);
    room.queue = (room.queue || []).filter((id) => id !== target.id);
    room.rematchVotes = (room.rematchVotes || []).filter((id) => id !== target.id);
    room.members = (room.members || []).filter((member) => member.id !== target.id);

    if (bv.ready) delete bv.ready[target.id];
    if (bv.memberUsers) delete bv.memberUsers[target.id];
    if (bv.chatRate) delete bv.chatRate[target.id];
    if (bv.pendingUndo?.requesterId === target.id) bv.pendingUndo = null;
    if (bv.pendingRematch && (
      bv.pendingRematch.requesterId === target.id ||
      bv.pendingRematch.requiredIds?.includes(target.id) ||
      bv.pendingRematch.acceptedIds?.includes(target.id)
    )) bv.pendingRematch = null;

    if (room.status === "waiting" && wasSeated) resetReady(room, false);
    appendEvent(room, "member_kicked", { memberId: owner.id, name: owner.name }, {
      targetMemberId: target.id,
      targetName: target.name,
      targetRole: target.role,
      phase: room.status,
    });

    await this.saveRoom();
    await this.updateOfflineAlarm();
    await this.syncLobby();
    await this.broadcastState();

    for (const socket of this.ctx.getWebSockets()) {
      if ((socket.deserializeAttachment?.() || {}).token !== target.token) continue;
      try { socket.close(4003, "kicked by host"); } catch {}
    }
  }
}

export class GameRoomV012 extends GameRoom {}

export default {
  async fetch(request, env, ctx) {
    const response = await appV011.fetch(request, env, ctx);
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
