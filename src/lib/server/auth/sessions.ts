import crypto from "node:crypto";

export const sessionCookieName = "nas_cloud_session";

// 14-day sliding window; the session is extended every time the owner
// makes an authenticated request (throttled to once per minute).
export const SESSION_LIFETIME_DAYS = 14;
export const SESSION_TOUCH_THROTTLE_MS = 60_000;

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + SESSION_LIFETIME_DAYS);
  return expires.toISOString();
}

export function shouldTouchSession(lastSeenAt: string, now = new Date()): boolean {
  const last = Date.parse(lastSeenAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= SESSION_TOUCH_THROTTLE_MS;
}
