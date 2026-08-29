import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { ADMIN_CLEANUP_SCRIPT } from "../src/admin/cleanup-ui.js";

const api = await readFile(new URL("../src/admin/api.js", import.meta.url), "utf8");
const pages = await readFile(new URL("../src/admin/pages.js", import.meta.url), "utf8");

assert.match(api, /SETTINGS_DEFAULTS/);
assert.match(api, /\/admin\/api\/settings\/reset/);
assert.match(api, /DELETE FROM system_settings WHERE key=\?/);
assert.match(api, /setting\.reset/);
assert.match(api, /\/admin\/api\/announcement\/disable/);
assert.match(api, /announcement\.disable/);
assert.match(api, /\/admin\/api\/announcement\/delete/);
assert.match(api, /DELETE FROM announcements WHERE id=\?/);
assert.match(api, /announcement\.delete/);
assert.match(api, /before, after: null/);
assert.match(pages, /ADMIN_CLEANUP_SCRIPT/);
assert.match(pages, /ADMIN_WORKBENCH_SCRIPT \+ ADMIN_CLEANUP_SCRIPT/);
assert.match(ADMIN_CLEANUP_SCRIPT, /恢復預設/);
assert.match(ADMIN_CLEANUP_SCRIPT, /永久刪除/);
assert.match(ADMIN_CLEANUP_SCRIPT, /停用公告/);
assert.match(ADMIN_CLEANUP_SCRIPT, /data-tab=\\"announcements\\"/);
assert.match(ADMIN_CLEANUP_SCRIPT, /\/admin\/api\/settings/);
assert.match(ADMIN_CLEANUP_SCRIPT, /\/admin\/api\/announcement\/delete/);
new vm.Script(ADMIN_CLEANUP_SCRIPT, { filename: "admin-cleanup-inline.js" });

console.log("admin-cleanup.test: PASS (setting reset, announcement disable/delete, audited UI controls)");
