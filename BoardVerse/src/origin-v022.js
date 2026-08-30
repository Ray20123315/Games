import appV021 from "./index-v021.js";

export * from "./index-v021.js";

function restoreOriginalRequest(request, env) {
  const expected = String(env?.BOARDVERSE_EDGE_SHARED_SECRET || "");
  const supplied = String(request.headers.get("x-boardverse-edge-secret") || "");
  if (!expected || !supplied || supplied !== expected) return request;
  let original;
  try { original = new URL(request.headers.get("x-boardverse-original-origin") || ""); }
  catch { return request; }
  if (original.protocol !== "https:") return request;

  const current = new URL(request.url);
  const restored = new URL(current.pathname + current.search, original);
  const headers = new Headers(request.headers);
  headers.delete("x-boardverse-edge-secret");
  headers.delete("x-boardverse-original-origin");
  headers.delete("x-boardverse-original-host");
  const forwarded = new Request(restored, request);
  return new Request(forwarded, { headers });
}

export default {
  fetch(request, env, ctx) {
    return appV021.fetch(restoreOriginalRequest(request, env), env, ctx);
  },
  scheduled(event, env, ctx) {
    return appV021.scheduled(event, env, ctx);
  },
};
