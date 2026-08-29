export const REVISION_MUTATIONS = new Set(["move", "pass", "swap_sides", "resign", "ready", "undo_request", "undo_accept", "undo_reject", "rematch_request", "rematch_accept"]);
export function parseWsMessage(message, max = 16 * 1024) {
  if (typeof message !== "string" || message.length > max) throw new Error("訊息格式或大小不合法。");
  let msg;
  try { msg = JSON.parse(message); } catch { throw new Error("JSON 格式錯誤。"); }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.type !== "string") throw new Error("訊息格式錯誤。");
  return msg;
}
