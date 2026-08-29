import app, { GameRoom, GlobalChat } from "./index.js";
import { hardenPieceThemeHtml } from "./ui/piece-theme.js";

export { GameRoom, GlobalChat };

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const body = hardenPieceThemeHtml(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  },
  scheduled(event, env, ctx) {
    return app.scheduled(event, env, ctx);
  },
};
