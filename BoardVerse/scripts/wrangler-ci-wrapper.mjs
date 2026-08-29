import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const WRANGLER_CI_WRAPPER_MARKER = "BOARDVERSE_WRANGLER_CI_WRAPPER_V1";

export function installWranglerCiWrapper({ root = process.cwd(), expectedWorker = "crimson-haze-0a4d" } = {}) {
  if (process.platform === "win32") {
    throw new Error("BoardVerse Workers CI wrapper requires a POSIX build environment");
  }

  const realWrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const binDir = path.join(root, "node_modules", ".bin");
  const wrapperPath = path.join(binDir, "wrangler");

  if (!existsSync(realWrangler)) {
    throw new Error(`Wrangler CLI not found at ${realWrangler}`);
  }

  const wrapper = `#!/usr/bin/env node\n// ${WRANGLER_CI_WRAPPER_MARKER}\nconst { spawnSync } = require("node:child_process");\nconst path = require("node:path");\n\nconst args = process.argv.slice(2);\nif (process.env.WORKERS_CI && args[0] === "deploy" && process.env.WRANGLER_CI_OVERRIDE_NAME) {\n  console.log(\`[boardverse-wrangler] ignoring Workers Builds connected-worker override "\${process.env.WRANGLER_CI_OVERRIDE_NAME}" for deploy; target comes from wrangler.jsonc (${expectedWorker})\`);\n  delete process.env.WRANGLER_CI_OVERRIDE_NAME;\n}\n\nconst realWrangler = path.resolve(__dirname, "../wrangler/bin/wrangler.js");\nconst result = spawnSync(process.execPath, [realWrangler, ...args], {\n  stdio: "inherit",\n  env: process.env,\n});\n\nif (result.error) {\n  console.error(result.error);\n  process.exit(1);\n}\nprocess.exit(result.status ?? 1);\n`;

  mkdirSync(binDir, { recursive: true });
  rmSync(wrapperPath, { force: true });
  writeFileSync(wrapperPath, wrapper, "utf8");
  chmodSync(wrapperPath, 0o755);

  return { wrapperPath, realWrangler };
}

export function hasWranglerCiWrapper({ root = process.cwd() } = {}) {
  const wrapperPath = path.join(root, "node_modules", ".bin", "wrangler");
  if (!existsSync(wrapperPath)) return false;
  try {
    return readFileSync(wrapperPath, "utf8").includes(WRANGLER_CI_WRAPPER_MARKER);
  } catch {
    return false;
  }
}
