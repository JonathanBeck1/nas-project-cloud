import crypto from "node:crypto";

export const sessionCookieName = "nas_cloud_session";

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 30);
  return expires.toISOString();
}
