import appV022, { GameRoom as GameRoomV022 } from "./index-v022.js";
import { injectUrgentV023 } from "./ui/urgent-v023.js";

export * from "./index-v022.js";
export { GameRoomV022 as GameRoom };

async function improve(response) {
  const type = String(response?.headers?.get("content-type") || "");
  if (!type.includes("text/html")) return response;
  const body = injectUrgentV023(await response.text());
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-ui-hotfix", "v023");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) { return improve(await appV022.fetch(request, env, ctx)); },
  scheduled(event, env, ctx) { return appV022.scheduled(event, env, ctx); },
};
