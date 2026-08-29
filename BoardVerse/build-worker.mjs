import { spawnSync } from "node:child_process";

const branch = process.env.WORKERS_CI_BRANCH || "local";
const targetWorker = "crimson-haze-0a4d";

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

console.log(
  `[boardverse-build] validating BoardVerse v0.1.1; branch=${branch}; deploy-target=${targetWorker}`,
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
console.log(
  `[boardverse-build] validation passed; Cloudflare deploy command may update existing live Worker ${targetWorker}`,
);
