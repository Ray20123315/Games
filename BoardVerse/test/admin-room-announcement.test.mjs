import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/index-v012.js", import.meta.url), "utf8");

test("admin layout is allowed to scroll vertically", () => {
  assert.match(source, /boardverse-admin-scroll-fix/);
  assert.match(source, /overflow:auto!important/);
  assert.match(source, /\.admin-frame\{height:auto!important/);
});

test("admin room announcement endpoint requires admin authentication", () => {
  assert.match(source, /\/admin\/api\/rooms\/announcement/);
  assert.match(source, /await requireAdmin\(effectiveEnv, request\)/);
  assert.match(source, /ROOM_CODE_RE\.test\(roomId\)/);
  assert.match(source, /MAX_ROOM_ANNOUNCEMENT = 500/);
  assert.match(source, /return toErrorResponse\(error\)/);
});

test("room announcement persists in feature state and broadcasts", () => {
  assert.match(source, /bv\.roomAnnouncement = text \? \{ text, updatedAt: Date\.now\(\), actor \} : null/);
  assert.match(source, /feature\.roomAnnouncement = announcement\?\.text/);
  assert.match(source, /await this\.saveRoom\(\)/);
  assert.match(source, /await this\.broadcastState\(\)/);
});

test("admin UI can send and clear announcements for selected rooms", () => {
  assert.match(source, /bvRoomAnnouncementControls/);
  assert.match(source, /data-room-check/);
  assert.match(source, /發送公告/);
  assert.match(source, /清除公告/);
});

test("room announcement has popup, top flashing banner, and chat reminder", () => {
  assert.match(source, /bvRoomAnnouncementOverlay/);
  assert.match(source, /bvAdminAnnouncementPulse/);
  assert.match(source, /bv-announcement-flash/);
  assert.match(source, /showPopup\(content\)/);
  assert.match(source, /chatReminder\(content,item\.updatedAt\)/);
  assert.match(source, /bvRoomAnnouncementChat/);
  assert.match(source, /ADMIN 房內公告/);
});

test("announcement changes are written to the admin audit log", () => {
  assert.match(source, /room\.announcement_set/);
  assert.match(source, /room\.announcement_clear/);
  assert.match(source, /await audit\(effectiveEnv\.BOARDVERSE_DB/);
});
