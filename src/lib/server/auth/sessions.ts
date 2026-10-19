import crypto from "node:crypto";
import type { createMetadataRepository } from "@/lib/server/metadata";

export const sessionCookieName = "nas_cloud_session";

// 14-day sliding window; the session is extended every time the owner
// makes an authenticated request (throttled to once per minute).
export const SESSION_LIFETIME_DAYS = 14;
export const SESSION_TOUCH_THROTTLE_MS = 60_000;

// With two-factor on, a correct password earns this short-lived challenge instead of a session.
export const loginChallengeCookieName = "nas_cloud_login_challenge";
export const LOGIN_CHALLENGE_MS = 5 * 60 * 1000;

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

type SessionRepo = Pick<
  ReturnType<typeof createMetadataRepository>,
  "findDeviceByName" | "createDevice" | "touchDevice" | "createSession"
>;

export function startBrowserSession(repo: SessionRepo, userId: string, deviceName: string): string {
  // One row per named browser, not one per login. Revoking a device deletes its row, so the next login starts a new one.
  const device =
    repo.findDeviceByName(userId, deviceName, "browser") ?? repo.createDevice({ userId, name: deviceName, kind: "browser" });
  repo.touchDevice(device.id);
  const token = createSessionToken();
  repo.createSession({ userId, deviceId: device.id, tokenHash: hashSessionToken(token), expiresAt: sessionExpiresAt() });
  return token;
}
