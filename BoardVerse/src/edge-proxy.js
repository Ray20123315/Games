function text(message, status = 503) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

function validOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname.endsWith(".workers.dev") ? url : null;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const origin = validOrigin(env?.BOARDVERSE_ORIGIN_URL);
    if (!origin) return text("BoardVerse origin 尚未設定。", 503);
    if (!env?.BOARDVERSE_EDGE_SHARED_SECRET) return text("BoardVerse edge shared secret 尚未設定。", 503);

    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, origin);
    const headers = new Headers(request.headers);
    headers.set("x-boardverse-original-origin", incoming.origin);
    headers.set("x-boardverse-original-host", incoming.host);
    headers.set("x-boardverse-edge-secret", String(env.BOARDVERSE_EDGE_SHARED_SECRET));
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

    const outbound = new Request(target, request);
    const withHeaders = new Request(outbound, { headers });
    return fetch(withHeaders);
  },
};
