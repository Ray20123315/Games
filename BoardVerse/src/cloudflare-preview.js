export {
  GameRoom,
  GlobalChat,
  BoardVerseDb,
  GameRoomV011,
  GlobalChatV011,
  BoardVerseDbV011,
} from "./index-v011.js";

export default {
  fetch() {
    return Response.json({ ok: true, app: "BoardVerse", version: "0.1.1", mode: "preview-build-check" });
  },
};
