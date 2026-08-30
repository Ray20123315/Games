import { FocusGuardGameRoom } from "./focus-guard-room.js";
import { appendEvent, ensureFeatureState, requireRevision, resetReady } from "./state.js";
import { gameCapacity, normalizeRoomSettingsInput } from "./settings-schema.js";
import { json } from "../core/http.js";

function memberByToken(room,token){return room?.members?.find((m)=>m?.token===token)||null;}
function memberById(room,id){return room?.members?.find((m)=>m?.id===id)||null;}
function nameKey(value){return String(value||"").normalize("NFKC").trim().toLocaleLowerCase("en-US");}
function cleanName(value){const out=String(value||"").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,40);if(!out)throw new Error("名稱不可為空白。");return out;}
function sideFor(gameId,seat){if(gameId==="qiguo")return null;if(gameId==="chess")return seat===0?"W":"B";if(["xiangqi","xiangqi_random","banqi"].includes(gameId))return seat===0?"R":"B";return seat===0?"B":"W";}
function sameJson(a,b){try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false;}}
function publicActor(member){return member?{memberId:member.id,userId:member.userId||null,name:member.name,side:member.side||null}:null;}
function currentConfig(room){const bv=ensureFeatureState(room);return{roomName:room.name,gameId:room.gameId,rules:structuredClone(room.rules||{}),privateRoom:!!room.privateRoom,queueEnabled:!!room.settings?.queueEnabled,rotationPolicy:room.settings?.rotationPolicy||"winner_stays",clockConfig:structuredClone(bv.clockConfig||{mode:"untimed"}),voiceEnabled:!!bv.voiceEnabled,playerChatSlowMs:Number(bv.playerChatSlowMs||0),spectatorChatSlowMs:Number(bv.spectatorChatSlowMs||0),focusGuardEnabled:bv.focusGuardEnabled!==false,focusGuardAllowedLeaves:Number(bv.focusGuardAllowedLeaves||0)};}

function bytesToBase64(bytes){let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
async function deriveReturnPassword(password,saltB64){const raw=atob(saltB64),salt=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)salt[i]=raw.charCodeAt(i);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password)),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256);return bytesToBase64(new Uint8Array(bits));}
async function setReturnPassword(member,password){const text=String(password??"");if(text.length>128)throw new Error("回場密碼最多 128 個字元。");if(!text){member.passwordSalt=null;member.passwordHash=null;return;}const salt=crypto.getRandomValues(new Uint8Array(16)),saltB64=bytesToBase64(salt);member.passwordSalt=saltB64;member.passwordHash=await deriveReturnPassword(text,saltB64);}

function resizeSeats(room,targetGameId,targetRules,targetQueue){
  const target=gameCapacity(targetGameId,targetRules),old=(room.seats||[]).filter(Boolean),keep=old.slice(0,target),removed=old.slice(target);
  room.seats=[...keep,...Array(Math.max(0,target-keep.length)).fill(null)];
  room.queue=Array.isArray(room.queue)?room.queue.filter((id)=>!keep.includes(id)):[];
  for(const id of removed){const m=memberById(room,id);if(!m)continue;m.side=null;if(targetQueue){m.role="queued";if(!room.queue.includes(m.id))room.queue.push(m.id);}else m.role="spectator";}
  keep.forEach((id,seat)=>{const m=memberById(room,id);if(!m)return;m.role="player";m.side=sideFor(targetGameId,seat);if(targetGameId==="qiguo")m.countries=[];else if("countries" in m)m.countries=[];});
}

function applySafeNow(room,cfg){const bv=ensureFeatureState(room);room.name=cfg.roomName;room.privateRoom=cfg.privateRoom;bv.playerChatSlowMs=cfg.playerChatSlowMs;bv.spectatorChatSlowMs=cfg.spectatorChatSlowMs;}
function prepareNextGame(room,cfg){
  const bv=ensureFeatureState(room);applySafeNow(room,cfg);
  room.settings=room.settings||{};room.settings.queueEnabled=cfg.gameId==="qiguo"?false:cfg.queueEnabled;room.settings.rotationPolicy=cfg.rotationPolicy;
  bv.clockConfig=structuredClone(cfg.clockConfig);bv.voiceEnabled=cfg.gameId==="qiguo"?false:cfg.voiceEnabled;if(bv.voiceEnabled)room.settings.queueEnabled=false;
  bv.focusGuardEnabled=cfg.focusGuardEnabled!==false;bv.focusGuardAllowedLeaves=Math.max(0,Math.min(20,Math.round(Number(cfg.focusGuardAllowedLeaves)||0)));bv.focusGuardViolations={};bv.focusGuardLastEvent={};bv.focusGuardMatchId=null;
  resizeSeats(room,cfg.gameId,cfg.rules,room.settings.queueEnabled);
  bv.pendingRoomSettings=structuredClone(cfg);bv.pendingUndo=null;bv.pendingRematch=null;bv.lastUndoSnapshot=null;bv.clock=null;bv.gameStartedAt=null;room.rematchVotes=[];room.opening=null;resetReady(room,false);
}
function activatePendingGame(room){const bv=ensureFeatureState(room),cfg=bv.pendingRoomSettings;if(!cfg)return false;room.gameId=cfg.gameId;room.rules=structuredClone(cfg.rules);bv.pendingRoomSettings=null;return true;}

export class RoomSettingsGameRoom extends FocusGuardGameRoom {
  async loadRoom(){const room=await super.loadRoom();if(room){const bv=ensureFeatureState(room);if(!("pendingRoomSettings" in bv))bv.pendingRoomSettings=null;}return room;}

  send(ws,payload){
    if(payload?.type==="feature_state"&&payload.feature&&this.room){const bv=ensureFeatureState(this.room),token=(ws?.deserializeAttachment?.()||{}).token||"",member=memberByToken(this.room,token),isOwner=!!member&&member.id===this.room.ownerId,target=bv.pendingRoomSettings||currentConfig(this.room);payload.feature.canConfigureRoom=isOwner;payload.feature.roomSettingsPending=!!bv.pendingRoomSettings;payload.feature.roomSettings=isOwner?{...structuredClone(target),roomCode:this.room.id,ownerName:member.name,ownerNameLocked:!!(bv.memberUsers?.[member.id]||member.userId),hasReturnPassword:!!(member.passwordHash&&member.passwordSalt),currentGameId:this.room.gameId,currentRules:structuredClone(this.room.rules||{}),status:this.room.status}:null;}
    return super.send(ws,payload);
  }

  async roomInfo(){const response=await super.roomInfo();if(!response.ok||!this.room)return response;const data=await response.json(),bv=ensureFeatureState(this.room),pending=bv.pendingRoomSettings;if(pending&&this.room.status!=="playing"){const cap=gameCapacity(pending.gameId,pending.rules),players=(this.room.seats||[]).filter(Boolean).length;data.room.capacity=cap;data.room.nextGameId=pending.gameId;data.room.nextRules=structuredClone(pending.rules);data.room.playerAction=players<cap?(this.room.privateRoom?"request":"join"):(this.room.settings?.queueEnabled?"queue":"disabled");}return json(data,response.status);}

  async webSocketMessage(ws,message){let parsed=null;try{parsed=typeof message==="string"?JSON.parse(message):null;}catch{}if(parsed?.type!=="room_settings_update")return super.webSocketMessage(ws,message);await this.loadRoom();if(!this.room)return;const token=(ws?.deserializeAttachment?.()||{}).token||"",member=memberByToken(this.room,token);if(!member){this.send(ws,{type:"error",code:"session_invalid",message:"工作階段已失效。"});return;}try{await this.handleRoomSettings(member,parsed);}catch(error){this.send(ws,{type:"error",code:error?.code||"room_settings_failed",expectedRevision:error?.expectedRevision,message:error?.message||"房間設定更新失敗。"});this.sendFeatureState(ws);}}

  async handleRoomSettings(member,msg){
    const room=this.room,bv=ensureFeatureState(room);requireRevision(room,msg.revision);if(member.id!==room.ownerId)throw new Error("只有房主可以修改房間設定。");
    const base=bv.pendingRoomSettings||currentConfig(room),cfg=normalizeRoomSettingsInput(msg.settings||{},base);applySafeNow(room,cfg);
    if(msg.ownerName!=null){const linked=!!(bv.memberUsers?.[member.id]||member.userId);const next=cleanName(msg.ownerName);if(linked&&nameKey(next)!==nameKey(member.name))throw new Error("登入會員的房內名稱跟隨帳號，請到帳號頁修改名稱。");if(!linked&&nameKey(next)!==nameKey(member.name)){if((room.members||[]).some((m)=>m.id!==member.id&&nameKey(m.name)===nameKey(next)))throw new Error("房內已有相同名稱。");member.name=next;member.nameKey=nameKey(next);}}
    const passwordMode=String(msg.returnPasswordMode||"unchanged");if(passwordMode==="clear")await setReturnPassword(member,"");else if(passwordMode==="set")await setReturnPassword(member,String(msg.returnPassword||""));
    if(room.status==="playing")bv.pendingRoomSettings=structuredClone(cfg);else prepareNextGame(room,cfg);
    bv.pendingRematch=null;resetReady(room,false);appendEvent(room,room.status==="playing"?"room_settings_queued":"room_settings_updated",publicActor(member),{nextGameId:cfg.gameId,privateRoom:cfg.privateRoom,queueEnabled:cfg.queueEnabled,rotationPolicy:cfg.rotationPolicy,clockMode:cfg.clockConfig?.mode||"untimed",focusGuardEnabled:cfg.focusGuardEnabled,focusGuardAllowedLeaves:cfg.focusGuardAllowedLeaves});
    await this.saveRoom();await this.syncLobby();await this.broadcastState();
  }

  maybeStartMatch(){if(this.room&&ensureFeatureState(this.room).pendingRoomSettings)activatePendingGame(this.room);return super.maybeStartMatch();}

  async finishMatch(result){const out=await super.finishMatch(result);if(this.room){const bv=ensureFeatureState(this.room);if(bv.pendingRoomSettings&&this.room.status!=="playing"){prepareNextGame(this.room,bv.pendingRoomSettings);await this.saveRoom();await this.syncLobby();await this.broadcastState();}}return out;}
}

export const GameRoom=RoomSettingsGameRoom;
