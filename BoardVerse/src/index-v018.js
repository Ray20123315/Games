import appV017 from "./index-v017.js";

export * from "./index-v017.js";

const DO_QUOTA_MARKERS = [
  "Exceeded allowed volume of requests in Durable Objects free tier",
  "Durable Objects free tier",
];

function quotaText(text) {
  const source = String(text || "");
  return DO_QUOTA_MARKERS.some((marker) => source.includes(marker));
}

async function isDoQuotaResponse(response) {
  if (!response || response.status < 500) return false;
  try {
    return quotaText(await response.clone().text());
  } catch {
    return false;
  }
}

function degradedEnv(env) {
  const hidden = new Set(["BOARDVERSE_DB", "BOARDVERSE_DB_DO", "ROOMS", "GLOBAL_CHAT"]);
  return new Proxy(env || {}, {
    get(target, prop, receiver) {
      if (hidden.has(String(prop))) return undefined;
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (hidden.has(String(prop))) return false;
      return Reflect.has(target, prop);
    },
  });
}

function degradedBanner() {
  return `<div id="boardverse-do-quota-notice" role="status" style="position:relative;z-index:9999;margin:10px auto;max-width:1100px;padding:12px 16px;border:1px solid #c9a54b;border-radius:12px;background:#211b0f;color:#fff1b7;font:800 13px/1.55 system-ui,-apple-system,'Microsoft JhengHei',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22)">BoardVerse 目前為暫時降級模式：Cloudflare Durable Objects 今日免費額度已用完。網站基本頁面仍可瀏覽；即時房間、聊天室與需要帳號資料的操作會暫停，額度重置後會自動恢復正常模式。</div>`;
}

async function decorateDegraded(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) {
    if (response.status >= 400) {
      return new Response(JSON.stringify({
        ok: false,
        error: "service_temporarily_limited",
        message: "Cloudflare Durable Objects 今日免費額度已用完；即時房間、聊天室與需要資料庫的操作暫時停用，額度重置後會自動恢復。",
      }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return response;
  }

  let body = await response.text();
  const banner = degradedBanner();
  if (!body.includes("boardverse-do-quota-notice")) {
    const bodyMatch = body.match(/<body[^>]*>/i);
    if (bodyMatch) body = body.replace(bodyMatch[0], `${bodyMatch[0]}${banner}`);
    else body = `${banner}${body}`;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-boardverse-degraded", "do-quota");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    let retryRequest;
    try { retryRequest = request.clone(); } catch { retryRequest = request; }

    let response;
    try {
      response = await appV017.fetch(request, env, ctx);
    } catch (error) {
      if (!quotaText(error?.message || error)) throw error;
      const degraded = await appV017.fetch(retryRequest, degradedEnv(env), ctx);
      return decorateDegraded(degraded);
    }

    if (!(await isDoQuotaResponse(response))) return response;
    const degraded = await appV017.fetch(retryRequest, degradedEnv(env), ctx);
    return decorateDegraded(degraded);
  },
  scheduled(event, env, ctx) {
    return appV017.scheduled(event, env, ctx);
  },
};
