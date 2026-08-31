import { createCardRoom, joinCardRoom, setCardReady, applyCardRoomAction, publicCardRoom, cardLobbySummary } from "./room.js";

const CARD_TTL_MS = 6 * 60 * 60 * 1000;
const CARD_LIST_WINDOW_MS = 24 * 60 * 60 * 1000;
const TABLE_SQL = `CREATE TABLE IF NOT EXISTS emergency_card_rooms (
  room_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  room_json TEXT NOT NULL,
  room_name TEXT NOT NULL,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`;
export function isCardDoQuotaError(value){const text=String(value?.message||value||"").toLowerCase();return text.includes("exceeded allowed volume of requests")||text.includes("durable objects free tier")||text.includes("durable object")&&text.includes("quota")||text.includes("limit exceeded")}
async function ensure(db){if(!db)throw Object.assign(new Error("BoardVerse D1 尚未可用。"),{status:503,code:"card_d1_unavailable"});if(typeof db.exec==="function")await db.exec(TABLE_SQL);else await db.prepare(TABLE_SQL).run()}
function parseRoom(row){try{return row?.room_json?JSON.parse(row.room_json):null}catch{return null}}
function err(message,status=400,code="card_d1_failed"){return Object.assign(new Error(message),{status,code})}
async function writeRoom(db,room,revision){const now=Date.now(),summary=cardLobbySummary(room),result=await db.prepare(`UPDATE emergency_card_rooms
    SET revision=revision+1,room_json=?,room_name=?,game_id=?,status=?,players=?,capacity=?,updated_at=?,expires_at=?
    WHERE room_id=? AND revision=?`).bind(JSON.stringify(room),summary.name,summary.gameId,summary.status,summary.players,summary.capacity,now,now+CARD_TTL_MS,room.id,revision).run();return Number(result?.meta?.changes??result?.changes??0)>0}
async function mutate(db,roomId,fn){await ensure(db);for(let attempt=0;attempt<4;attempt++){const row=await db.prepare("SELECT revision,room_json FROM emergency_card_rooms WHERE room_id=? AND expires_at>?").bind(roomId,Date.now()).first();if(!row)throw err("找不到卡牌房間。",404,"card_room_not_found");const room=parseRoom(row);if(!room)throw err("卡牌房資料損壞。",500,"card_room_corrupt");const out=await fn(room);if(await writeRoom(db,room,Number(row.revision||0)))return{room,out}}throw err("卡牌房狀態剛剛已更新，請再試一次。",409,"card_room_stale")}
export async function listD1CardRooms(db){await ensure(db);const now=Date.now(),result=await db.prepare(`SELECT room_id,room_name,game_id,status,players,capacity,updated_at
    FROM emergency_card_rooms WHERE expires_at>? AND updated_at>? ORDER BY updated_at DESC LIMIT 100`).bind(now,now-CARD_LIST_WINDOW_MS).all();return(result?.results||[]).map(r=>({id:String(r.room_id),name:String(r.room_name),gameId:String(r.game_id),gameTitle:String(r.game_id),status:String(r.status),players:Number(r.players||0),capacity:Number(r.capacity||0),updatedAt:Number(r.updated_at||0)}))}
export async function createD1CardRoom(db,{roomId,roomName,gameId,playerName,maxPlayers,ownerUserId=null,returnPassword=""}){await ensure(db);const room=await createCardRoom({roomId,roomName,gameId,ownerName:playerName,maxPlayers,ownerUserId,returnPassword}),now=Date.now(),summary=cardLobbySummary(room);try{await db.prepare(`INSERT INTO emergency_card_rooms(room_id,revision,room_json,room_name,game_id,status,players,capacity,created_at,updated_at,expires_at)
      VALUES(?,0,?,?,?,?,?,?,?,?,?)`).bind(room.id,JSON.stringify(room),summary.name,summary.gameId,summary.status,summary.players,summary.capacity,now,now,now+CARD_TTL_MS).run()}catch(e){const text=String(e?.message||e||"").toLowerCase();if(text.includes("unique")||text.includes("constraint"))throw err("卡牌房號已存在。",409,"card_room_exists");throw e}return{room,token:room.players[0].token}}
export async function joinD1CardRoom(db,roomId,playerName,options={}){return mutate(db,roomId,room=>joinCardRoom(room,playerName,options))}
export async function stateD1CardRoom(db,roomId,token=""){await ensure(db);const row=await db.prepare("SELECT room_json FROM emergency_card_rooms WHERE room_id=? AND expires_at>?").bind(roomId,Date.now()).first();if(!row)throw err("找不到卡牌房間。",404,"card_room_not_found");const room=parseRoom(row);if(!room)throw err("卡牌房資料損壞。",500,"card_room_corrupt");return publicCardRoom(room,token)}
export async function readyD1CardRoom(db,roomId,token,ready=true){const{room}=await mutate(db,roomId,r=>setCardReady(r,token,ready));return publicCardRoom(room,token)}
export async function actionD1CardRoom(db,roomId,token,action){const{room}=await mutate(db,roomId,r=>applyCardRoomAction(r,token,action));return publicCardRoom(room,token)}
