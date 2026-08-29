import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { installWranglerCiWrapper, hasWranglerCiWrapper } from "../scripts/wrangler-ci-wrapper.mjs";

const root = path.join(os.tmpdir(), `boardverse-wrangler-wrapper-${process.pid}-${Date.now()}`);
const realDir = path.join(root, "node_modules", "wrangler", "bin");
const output = path.join(root, "result.json");

mkdirSync(realDir, { recursive: true });
const fakeWrangler = path.join(realDir, "wrangler.js");
writeFileSync(
  fakeWrangler,
  `#!/usr/bin/env node\nconst fs=require("node:fs");\nfs.writeFileSync(process.env.WRANGLER_TEST_OUTPUT, JSON.stringify({ args: process.argv.slice(2), override: process.env.WRANGLER_CI_OVERRIDE_NAME ?? null, workersCi: process.env.WORKERS_CI ?? null }));\nprocess.exit(Number(process.env.WRANGLER_TEST_EXIT_CODE || 0));\n`,
  "utf8",
);
chmodSync(fakeWrangler, 0o755);

try {
  const { wrapperPath } = installWranglerCiWrapper({ root });
  assert.equal(hasWranglerCiWrapper({ root }), true, "wrapper marker must be detectable");

  const run = (args, extraEnv = {}) =>
    spawnSync(process.execPath, [wrapperPath, ...args], {
      env: {
        ...process.env,
        WRANGLER_TEST_OUTPUT: output,
        ...extraEnv,
      },
      encoding: "utf8",
    });

  let result = run(["deploy", "--dry-run"], {
    WORKERS_CI: "1",
    WRANGLER_CI_OVERRIDE_NAME: "games",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  let observed = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(observed.args, ["deploy", "--dry-run"]);
  assert.equal(observed.override, null, "CI deploy must remove connected Worker override");

  result = run(["versions", "upload"], {
    WORKERS_CI: "1",
    WRANGLER_CI_OVERRIDE_NAME: "games",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  observed = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(observed.override, "games", "non-deploy Wrangler commands must preserve override");

  result = run(["deploy"], {
    WORKERS_CI: "",
    WRANGLER_CI_OVERRIDE_NAME: "games",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  observed = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(observed.override, "games", "non-CI deploy must preserve caller environment");

  result = run(["deploy"], {
    WORKERS_CI: "1",
    WRANGLER_CI_OVERRIDE_NAME: "games",
    WRANGLER_TEST_EXIT_CODE: "7",
  });
  assert.equal(result.status, 7, "wrapper must propagate Wrangler exit status");

  console.log("wrangler-ci-wrapper.test: PASS");
} finally {
  rmSync(root, { recursive: true, force: true });
}
