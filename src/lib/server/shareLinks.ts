import crypto from "node:crypto";

export const DEFAULT_SHARE_EXPIRES_IN_HOURS = 24;
export const MAX_SHARE_EXPIRES_IN_HOURS = 24 * 30;

export function createShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function shareExpiresAt(expiresInHours = DEFAULT_SHARE_EXPIRES_IN_HOURS, now = new Date()): string {
  const boundedHours = Math.min(MAX_SHARE_EXPIRES_IN_HOURS, Math.max(1, Math.floor(expiresInHours)));
  const expires = new Date(now);
  expires.setUTCHours(expires.getUTCHours() + boundedHours);
  return expires.toISOString();
}
