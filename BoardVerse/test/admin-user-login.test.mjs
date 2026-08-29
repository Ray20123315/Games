import assert from "node:assert/strict";
import { adminUserLogin } from "../src/admin/auth.js";

class FakeDb {
  constructor() { this.user = null; this.sessions = []; }
  prepare(sql) {
    const db = this;
    return {
      bind(...binds) {
        return {
          async first() {
            if (/SELECT \* FROM users WHERE username_normalized=\?/.test(sql)) {
              return db.user && db.user.username_normalized === binds[0] ? { ...db.user } : null;
            }
            throw new Error(`unexpected first SQL: ${sql}`);
          },
          async run() {
            if (/INSERT INTO users/.test(sql)) {
              if (!db.user) {
                const [id, username_normalized, username_display, email_normalized, email_verified_at, created_at, updated_at] = binds;
                db.user = {
                  id, username_normalized, username_display, email_normalized, email_verified_at,
                  password_algorithm: "ADMIN_SECRET", password_iterations: 0, password_salt: null, password_hash: null,
                  status: "active", suspended_until: null, gp: 0, level: 1, reputation: 100,
                  unlimited_custom_room_id: 0, custom_room_suspended_until: null, created_at, updated_at,
                };
              }
              return { success: true };
            }
            if (/UPDATE users SET status='active'/.test(sql)) {
              db.user.status = "active"; db.user.suspended_until = null; db.user.updated_at = binds[0];
              return { success: true };
            }
            if (/UPDATE users SET email_verified_at=\?/.test(sql)) {
              db.user.email_verified_at = binds[0]; db.user.updated_at = binds[1];
              return { success: true };
            }
            if (/INSERT INTO user_sessions/.test(sql)) {
              db.sessions.push({ id: binds[0], user_id: binds[1], token_hash: binds[2], created_at: binds[3], expires_at: binds[4] });
              return { success: true };
            }
            throw new Error(`unexpected run SQL: ${sql}`);
          },
        };
      },
    };
  }
}

const env = { ADMIN_USERNAME: "RootAdmin", ADMIN_PASSWORD: "correct horse battery staple" };
const db = new FakeDb();

assert.equal(await adminUserLogin(db, env, "RootAdmin", "wrong"), null, "wrong admin password must not bridge");
assert.equal(db.user, null, "wrong admin password must not create a user profile");

const first = await adminUserLogin(db, env, "RootAdmin", env.ADMIN_PASSWORD);
assert.equal(first.adminBridged, true);
assert.equal(first.user.username_display, "RootAdmin");
assert.ok(first.user.email_verified_at, "bridged admin profile must be treated as verified");
assert.match(first.session.setCookie, /^bv_session=/, "bridge must issue only the normal user session cookie");
assert.doesNotMatch(first.session.setCookie, /bv_admin=/, "bridge must not grant admin cookie through user login");
assert.equal(db.sessions.length, 1);
const firstUserId = first.user.id;

const second = await adminUserLogin(db, env, "RootAdmin", env.ADMIN_PASSWORD);
assert.equal(second.user.id, firstUserId, "repeat login must reuse the same user profile");
assert.equal(db.sessions.length, 2, "repeat login should create a fresh user session, not a duplicate user");

console.log("admin-user-login.test: PASS (admin credentials can obtain a normal user session without admin elevation)");
