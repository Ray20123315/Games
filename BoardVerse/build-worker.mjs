import { spawnSync } from "node:child_process";

const PROD_HOSTNAME = "xn--gmqt6w03b11v.ray2025.com";
const PROD_UNICODE_HOSTNAME = "多人棋室.ray2025.com";
const PROD_SERVICE = "games";
const PROD_ZONE = "ray2025.com";
const CANONICAL_ROUTE = `${PROD_HOSTNAME}/*`;
const branch = process.env.WORKERS_CI_BRANCH || "local";
const isWorkersBuild = Boolean(process.env.WORKERS_CI);
const isProduction = isWorkersBuild && branch === "main";

function run(label, command, args) {
  console.log(`[boardverse-build] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function credentials() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    throw new Error(
      "Cloudflare Workers Builds did not expose CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID to the production build.",
    );
  }
  return { token, account };
}

async function cfRequest(method, pathname, payload = undefined) {
  const { token } = credentials();
  const headers = { Authorization: `Bearer ${token}` };
  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(15000),
  };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, options);
  } catch (error) {
    throw new Error(`${method} ${pathname} network failure: ${error.message}`);
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const details = Array.isArray(body?.errors)
      ? body.errors
          .map((item) => `${item?.code ? `${item.code}: ` : ""}${item?.message || "unknown error"}`)
          .join("; ")
      : `HTTP ${response.status}`;
    throw new Error(`${method} ${pathname} failed: ${details}`);
  }
  return body.result;
}

async function accountRequest(method, pathname, payload = undefined) {
  const { account } = credentials();
  return cfRequest(method, `/accounts/${account}${pathname}`, payload);
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function attachProductionDomain() {
  console.log(`[boardverse-build] attaching Custom Domain ${PROD_HOSTNAME} -> ${PROD_SERVICE}`);
  await accountRequest("PUT", "/workers/domains", {
    hostname: PROD_HOSTNAME,
    service: PROD_SERVICE,
    zone_name: PROD_ZONE,
  });

  const domains = normalizeRows(
    await accountRequest("GET", `/workers/domains?hostname=${encodeURIComponent(PROD_HOSTNAME)}`),
  );
  const live = domains.find(
    (item) => String(item?.hostname || "").toLowerCase() === PROD_HOSTNAME.toLowerCase(),
  );
  if (!live || live.service !== PROD_SERVICE || !live.zone_id) {
    throw new Error(
      `Custom Domain read-back did not confirm ${PROD_HOSTNAME} -> ${PROD_SERVICE}; ` +
        `service=${live?.service || "missing"}, zone_id=${live?.zone_id || "missing"}`,
    );
  }
  console.log(
    `[boardverse-build] Custom Domain verified: ${PROD_HOSTNAME} -> ${PROD_SERVICE}; zone_id=${live.zone_id}`,
  );
  return live.zone_id;
}

function stripScheme(pattern) {
  return String(pattern || "").trim().toLowerCase().replace(/^https?:\/\//, "");
}

function isExactHostnameCatchAll(pattern) {
  const normalized = stripScheme(pattern);
  const slash = normalized.indexOf("/");
  if (slash < 0) return false;
  const host = normalized.slice(0, slash);
  const path = normalized.slice(slash);
  const acceptedHost =
    host === PROD_HOSTNAME.toLowerCase() || host === PROD_UNICODE_HOSTNAME.toLowerCase();
  return acceptedHost && path === "/*";
}

async function reconcileProductionRoutes(zoneId) {
  const routePath = `/zones/${zoneId}/workers/routes`;
  let routes = normalizeRows(await cfRequest("GET", routePath));

  const hostnameRoutes = routes.filter((route) =>
    stripScheme(route?.pattern).includes(PROD_HOSTNAME.toLowerCase()) ||
    stripScheme(route?.pattern).includes(PROD_UNICODE_HOSTNAME.toLowerCase()),
  );
  for (const route of hostnameRoutes) {
    console.log(
      `[boardverse-build] existing hostname route: ${route.pattern} -> ${route.script || "(none)"}`,
    );
  }

  let exactRoutes = routes.filter((route) => isExactHostnameCatchAll(route?.pattern));
  if (exactRoutes.length === 0) {
    console.log(`[boardverse-build] creating exact Worker Route ${CANONICAL_ROUTE} -> ${PROD_SERVICE}`);
    await cfRequest("POST", routePath, {
      pattern: CANONICAL_ROUTE,
      script: PROD_SERVICE,
    });
  } else {
    for (const route of exactRoutes) {
      if (route.script === PROD_SERVICE) {
        console.log(`[boardverse-build] Worker Route already correct: ${route.pattern} -> ${PROD_SERVICE}`);
        continue;
      }
      if (!route.id) {
        throw new Error(`Exact Worker Route is missing an id: ${route.pattern}`);
      }
      console.log(
        `[boardverse-build] repointing Worker Route ${route.pattern}: ${route.script || "(none)"} -> ${PROD_SERVICE}`,
      );
      await cfRequest("PUT", `${routePath}/${route.id}`, {
        pattern: route.pattern,
        script: PROD_SERVICE,
      });
    }
  }

  routes = normalizeRows(await cfRequest("GET", routePath));
  exactRoutes = routes.filter((route) => isExactHostnameCatchAll(route?.pattern));
  const verified = exactRoutes.find((route) => route.script === PROD_SERVICE);
  if (!verified) {
    const state = exactRoutes.map((route) => `${route.pattern}->${route.script || "(none)"}`).join(", ");
    throw new Error(`Worker Route read-back did not confirm ${CANONICAL_ROUTE} -> ${PROD_SERVICE}; ${state || "no exact route"}`);
  }
  console.log(`[boardverse-build] Worker Route verified: ${verified.pattern} -> ${PROD_SERVICE}`);
}

async function main() {
  console.log(
    `[boardverse-build] validating BoardVerse v0.1.1; branch=${branch}; production=${isProduction}`,
  );
  run("full regression suite", "npm", ["test"]);
  run("Wrangler production dry-run", "npx", [
    "wrangler",
    "deploy",
    "--dry-run",
    "--config",
    "wrangler.jsonc",
    "--outdir",
    "dist",
  ]);

  if (!isProduction) {
    console.log("[boardverse-build] preview/local build: skipping production Cloudflare routing mutations");
    return;
  }

  const zoneId = await attachProductionDomain();
  await reconcileProductionRoutes(zoneId);
  console.log(
    "[boardverse-build] production routing read-back passed; configured Cloudflare deploy command may continue",
  );
}

main().catch((error) => {
  console.error(`[boardverse-build] ${error.stack || error.message}`);
  process.exit(1);
});
