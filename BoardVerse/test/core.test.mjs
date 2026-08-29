import assert from "node:assert/strict";
import { createClock, settleActive, completeLegalMove, normalizeClockConfig } from "../src/clock/clock-engine.js";
import { ensureFeatureState, appendEvent, requireRevision, gameSnapshot, resetReady, allPlayersReady } from "../src/room/state.js";
import { setDeadline, dueDeadlines, nextDeadline, cancelDeadline } from "../src/room/deadline-scheduler.js";
import { levelForGp, levelPolicy, taipeiDateKey } from "../src/membership/membership.js";
import { ROOM_CODE_RE } from "../src/core/config.js";

for (const mode of ["untimed","sudden_death","fischer","bronstein_delay","japanese_byoyomi"]) assert.equal(normalizeClockConfig({mode}).mode,mode);
let c=createClock({mode:"sudden_death",mainMs:10_000},["B","W"],"B",1000); assert.equal(settleActive(c,5000).clock.mainRemainingMs.B,6000); assert.equal(settleActive(c,11001).timedOut,true);
c=createClock({mode:"fischer",mainMs:10_000,incrementMs:3_000},["B","W"],"B",1000); let r=completeLegalMove(c,"W",4000); assert.equal(r.clock.mainRemainingMs.B,10_000); assert.equal(r.clock.activePlayer,"W");
c=createClock({mode:"bronstein_delay",mainMs:10_000,delayMs:3_000},["B","W"],"B",1000); assert.equal(settleActive(c,3000).clock.mainRemainingMs.B,10_000); assert.equal(settleActive(c,6000).clock.mainRemainingMs.B,8000); c.mainRemainingMs.B=0; c.turnStartedAt=1000; assert.equal(settleActive(c,3500).timedOut,false); assert.equal(settleActive(c,4500).timedOut,true);
c=createClock({mode:"japanese_byoyomi",mainMs:10000,byoPeriodMs:5000,byoPeriods:3},["B","W"],"B",1000); let s=settleActive(c,17000); assert.equal(s.timedOut,false); assert.equal(s.clock.periodsRemaining.B,2); s=settleActive(c,27000); assert.equal(s.timedOut,true);

const room={seats:["a","b"],members:[{id:"a"},{id:"b"}],game:{turn:"B",board:[]},status:"waiting"}; const bv=ensureFeatureState(room,1000); assert.equal(bv.revision,0); appendEvent(room,"game_created",null,{}); assert.equal(bv.revision,1); assert.throws(()=>requireRevision(room,0)); assert.doesNotThrow(()=>requireRevision(room,1)); resetReady(room,false); assert.equal(allPlayersReady(room),false); bv.ready.a=bv.ready.b=true; assert.equal(allPlayersReady(room),true); assert.equal(gameSnapshot(room).revision,1);
setDeadline(bv,"clock","clock_timeout",5000,1); setDeadline(bv,"offline:a","offline_forfeit",4000,1); assert.equal(nextDeadline(bv).key,"offline:a"); assert.equal(dueDeadlines(bv,4500).length,1); cancelDeadline(bv,"offline:a"); assert.equal(nextDeadline(bv).key,"clock");
assert.equal(ROOM_CODE_RE.test("ABC234"),true); assert.equal(ROOM_CODE_RE.test("AIC234"),false); assert.equal(ROOM_CODE_RE.test("AOC234"),false);
assert.equal(levelForGp(0).level,1); assert.equal(levelForGp(250).level,2); assert.equal(levelForGp(5000).level,5); assert.equal(levelPolicy(4).customRoomsPerDay,7); assert.match(taipeiDateKey(Date.UTC(2026,7,28,16,0,0)),/^2026-08-29$/);
console.log("core.test: PASS");
