import { MEMBERSHIP_LEVELS } from "../core/config.js";

export function isOwnerUser(user) {
  return !!user
    && user.password_algorithm === "ADMIN_SECRET"
    && String(user.email_normalized || "").toLocaleLowerCase("en-US").endsWith("@boardverse.invalid");
}

export function maxMembershipPolicy() {
  return MEMBERSHIP_LEVELS[MEMBERSHIP_LEVELS.length - 1];
}

export function effectiveMembership(user, membership) {
  if (!isOwnerUser(user)) return membership;
  const policy = maxMembershipPolicy();
  return {
    ...(membership || {}),
    gp: policy.gp,
    level: policy.level,
    policy,
    levelInfo: policy,
    isOwner: true,
    maxed: true,
  };
}

export function publicIdentityForUser(user, membership) {
  if (!user) return { role: "guest", badge: "訪客", level: null, name: null };
  if (isOwnerUser(user)) {
    const max = maxMembershipPolicy();
    return { role: "owner", badge: "OWNER", level: max.level, name: String(user.username_display || user.username || "OWNER") };
  }
  const level = Math.max(1, Number(membership?.level || user.level || 1));
  return { role: "member", badge: `Lv.${level}`, level, name: String(user.username_display || user.username || "Member") };
}

export function publicAdminIdentity(name) {
  return { role: "admin", badge: "ADMIN", level: null, name: String(name || "Admin") };
}

export function publicGuestIdentity(name = null) {
  return { role: "guest", badge: "訪客", level: null, name: name ? String(name) : null };
}
