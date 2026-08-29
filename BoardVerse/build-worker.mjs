import { spawnSync } from "node:child_process";

const branch = process.env.WORKERS_CI_BRANCH || "local";
const isWorkersBuild = Boolean(process.env.WORKERS_CI);
const isProduction = isWorkersBuild && branch === "main";
const targetWorker = "games";
const connectedWorker = process.env.WRANGLER_CI_OVERRIDE_NAME || "(none)";

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

if (isWorkersBuild && connectedWorker !== targetWorker) {
  throw new Error(
    `Workers Builds connected Worker ${connectedWorker} does not match canonical target ${targetWorker}`,
  );
}

console.log(
  `[boardverse-build] validating BoardVerse v0.1.1; branch=${branch}; production=${isProduction}; ` +
    `connected-worker=${connectedWorker}; live-target=${targetWorker}`,
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
    `[boardverse-build] production validation complete; Cloudflare Deploy command will deploy connected Worker ${targetWorker}`,
  );
} else {
  console.log("[boardverse-build] preview/local validation complete; no live deployment performed by build command");
}
