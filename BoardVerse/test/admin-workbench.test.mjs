import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminDashboardPage } from "../src/admin/pages.js";
import { ADMIN_WORKBENCH_STYLE } from "../src/admin/workbench.js";
import { ensureFeatureState } from "../src/room/state.js";

const html=await adminDashboardPage().text();
const nav=["帳號","房間","Replay","回報","Risk Flags","公告","Global Chat","Audit Log"];
let pos=-1;
for(const label of nav){const next=html.indexOf(`>${label}</button>`,pos+1);assert.ok(next>pos,`nav order: ${label}`);pos=next;}
assert.match(html,/class="admin-frame"/);
assert.match(ADMIN_WORKBENCH_STYLE,/calc\(100dvh \* 16 \/ 9\)/);
assert.match(ADMIN_WORKBENCH_STYLE,/calc\(100vw \* 9 \/ 16\)/);
assert.match(ADMIN_WORKBENCH_STYLE,/appearance:none/);
assert.match(ADMIN_WORKBENCH_STYLE,/\.scroll\{min-height:0;overflow:auto/);
assert.doesNotMatch(html,/type="checkbox"/);
for(const id of ["batchPause","batchResume","batchTerminate","batchClose","roomBatchReason","roomSelectAll"]) assert.ok(html.includes(id),id);
assert.match(html,/\/admin\/api\/rooms\/batch/);
assert.match(html,/confirmOverlay/);

const api=await readFile(new URL("../src/admin/api.js",import.meta.url),"utf8");
for(const marker of ["/admin/api/rooms/batch","/admin/pause-room","/admin/resume-room","room.pause","room.resume"]) assert.ok(api.includes(marker),marker);
const entry=await readFile(new URL("../src/index-v011.js",import.meta.url),"utf8");
for(const marker of ["adminPauseRoom","adminResumeRoom","room_admin_paused","computeDeadline","adminPausedOffline","boardverse-admin-pause-notice"]) assert.ok(entry.includes(marker),marker);
const state=await readFile(new URL("../src/room/state.js",import.meta.url),"utf8");
assert.match(state,/adminPaused: false/);
assert.match(state,/adminPausedAt: null/);

const pausedRoom={
  status:"playing",seats:["p1"],ownerId:"p1",members:[{id:"p1",connected:false,offlineDeadline:106000}],
  bv:{schemaVersion:1,revision:0,gameInstanceId:"g",ready:{p1:true},events:[],clockConfig:{mode:"untimed"},deadlines:{},memberUsers:{},adminPaused:true,adminPausedAt:100000,ownerGraceMs:600000,ownerDisconnectedAt:100000}
};
const paused=ensureFeatureState(pausedRoom,101000);
assert.equal(paused.adminPausedOffline.p1,5000,"disconnect countdown should be captured while paused");
assert.equal(paused.adminPausedOwnerGraceMs,599000,"owner grace should be frozen while paused");
console.log("admin-workbench.test: PASS");
