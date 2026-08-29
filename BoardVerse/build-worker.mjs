import { spawnSync } from "node:child_process";
import { installWranglerCiWrapper, hasWranglerCiWrapper } from "./scripts/wrangler-ci-wrapper.mjs";

const branch = process.env.WORKERS_CI_BRANCH || "local";
const isWorkersBuild = Boolean(process.env.WORKERS_CI);
const isProduction = isWorkersBuild && branch === "main";
const targetWorker = "crimson-haze-0a4d";
const connectedWorkerOverride = process.env.WRANGLER_CI_OVERRIDE_NAME || "(none)";

function run(label, command, args, env = process.env) {
  console.log(`[boardverse-build] ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

if (isWorkersBuild) {
  installWranglerCiWrapper({ expectedWorker: targetWorker });
  if (!hasWranglerCiWrapper()) {
    throw new Error("Workers CI Wrangler wrapper installation verification failed");
  }
  console.log(
    `[boardverse-build] installed CI Wrangler deploy wrapper; deploy ignores connected-worker override=${connectedWorkerOverride} and uses ${targetWorker}`,
  );
}

console.log(
  `[boardverse-build] validating BoardVerse v0.1.1; branch=${branch}; production=${isProduction}; ` +
    `connected-worker-override=${connectedWorkerOverride}; live-target=${targetWorker}`,
);
run("full regression suite", "npm", ["test"]);
run("Wrangler live-worker dry-run", "npx", [
  "wrangler",
  "deploy",
  "--dry-run",
  "--config",
  "wrangler.jsonc",
  "--outdir",
  "dist",
]);

if (isProduction) {
  console.log(
    `[boardverse-build] production validation complete; Cloudflare Deploy command will perform the single live deploy to ${targetWorker}`,
  );
} else {
  console.log("[boardverse-build] preview/local build validation complete; no live deployment performed by build command");
}
