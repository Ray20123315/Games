import { RoomSettingsGameRoom as BaseRoomSettingsGameRoom } from "./settings-room.js";
import { ensureFeatureState } from "./state.js";

export class RoomSettingsGameRoom extends BaseRoomSettingsGameRoom {
  maybeStartMatch(){
    const room=this.room,bv=room?ensureFeatureState(room):null,pending=bv?.pendingRoomSettings||null;
    const allReady=!!room&&Array.isArray(room.seats)&&room.seats.length>=2&&room.seats.every((id)=>!!id&&bv?.ready?.[id]===true);
    if(pending&&!allReady){
      bv.pendingRoomSettings=null;
      try{return super.maybeStartMatch();}
      finally{if(!bv.pendingRoomSettings)bv.pendingRoomSettings=pending;}
    }
    return super.maybeStartMatch();
  }
}

export const GameRoom=RoomSettingsGameRoom;
