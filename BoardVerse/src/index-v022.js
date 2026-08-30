import appV021 from "./index-v021.js";
import { RoomSettingsGameRoom } from "./room/settings-room.js";
import { injectRoomSettingsUi } from "./ui/room-settings.js";
import { injectRoomReplayLayout } from "./ui/room-replay-layout.js";

export * from "./index-v021.js";
export { RoomSettingsGameRoom as GameRoom };

async function decorateRoomSettings(response){
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;
  let body=await response.text();
  body=injectRoomSettingsUi(body);
  body=injectRoomReplayLayout(body);
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control","no-store");
  headers.set("x-boardverse-room-settings","full-page-v1");
  headers.set("x-boardverse-room-replay","fixed-large-responsive-v1");
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){return decorateRoomSettings(await appV021.fetch(request,env,ctx));},
  scheduled(event,env,ctx){return appV021.scheduled(event,env,ctx);},
};
