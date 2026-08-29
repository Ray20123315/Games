import assert from "node:assert/strict";
import { verifyTurnstile } from "../src/reports/reports.js";
import { reportPage } from "../src/ui/pages.js";

const request = new Request("https://xn--gmqt6w03b11v.ray2025.com/report", {
  headers: { "CF-Connecting-IP": "203.0.113.7" },
});
const env = {
  TURNSTILE_SECRET_KEY: "test-secret-not-production",
  TURNSTILE_HOSTNAMES: "xn--gmqt6w03b11v.ray2025.com,多人棋室.ray2025.com",
};

const originalFetch = globalThis.fetch;
try {
  let seenBody = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
    seenBody = new URLSearchParams(String(init.body));
    return new Response(JSON.stringify({
      success: true,
      action: "report",
      hostname: "xn--gmqt6w03b11v.ray2025.com",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.equal(await verifyTurnstile(env, "fresh-token", request), true);
  assert.equal(seenBody.get("secret"), env.TURNSTILE_SECRET_KEY);
  assert.equal(seenBody.get("response"), "fresh-token");
  assert.equal(seenBody.get("remoteip"), "203.0.113.7");

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, action: "other", hostname: "xn--gmqt6w03b11v.ray2025.com" }), { status: 200 });
  await assert.rejects(() => verifyTurnstile(env, "fresh-token", request), (e) => e?.status === 403 && e?.code === "turnstile_failed");

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, action: "report", hostname: "evil.example" }), { status: 200 });
  await assert.rejects(() => verifyTurnstile(env, "fresh-token", request), (e) => e?.status === 403 && e?.code === "turnstile_failed");

  globalThis.fetch = async () => new Response("upstream", { status: 500 });
  await assert.rejects(() => verifyTurnstile(env, "fresh-token", request), (e) => e?.status === 403 && e?.code === "turnstile_failed");

  await assert.rejects(() => verifyTurnstile(env, "x".repeat(2049), request), (e) => e?.status === 403 && e?.code === "turnstile_required");
  await assert.rejects(() => verifyTurnstile({ TURNSTILE_SECRET_KEY: "test" }, "token", request), (e) => e?.status === 503 && e?.code === "turnstile_unconfigured");

  const html = await (await reportPage("public-test-site-key")).text();
  assert.match(html, /class="cf-turnstile"/);
  assert.match(html, /data-sitekey="public-test-site-key"/);
  assert.match(html, /data-action="report"/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("turnstile.test: PASS");
