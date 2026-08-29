import { spawnSync } from "node:child_process";

const branch = process.env.WORKERS_CI_BRANCH || "local";
const isWorkersBuild = Boolean(process.env.WORKERS_CI);
const isProduction = isWorkersBuild && branch === "main";
const targetWorker = "crimson-haze-0a4d";

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

console.log(
  `[boardverse-build] validating BoardVerse v0.1.1; branch=${branch}; production=${isProduction}; ` +
    `connected-worker-override=${process.env.WRANGLER_CI_OVERRIDE_NAME || "(none)"}; live-target=${targetWorker}`,
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

if (!isProduction) {
  console.log("[boardverse-build] preview/local build: explicit live Worker deploy skipped");
  process.exit(0);
}

const deployEnv = { ...process.env };
delete deployEnv.WRANGLER_CI_OVERRIDE_NAME;
console.log(
  `[boardverse-build] production build: removed WRANGLER_CI_OVERRIDE_NAME and explicitly deploying ${targetWorker}`,
);
run(
  `explicit production deploy to ${targetWorker}`,
  "npx",
  ["wrangler", "deploy", "--config", "wrangler.jsonc"],
  deployEnv,
);
console.log(`[boardverse-build] explicit live Worker deploy completed: ${targetWorker}`);
