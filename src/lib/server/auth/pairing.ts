import crypto from "node:crypto";

export function createPairingCode(): string {
  const value = crypto.randomInt(0, 1_000_000);
  const digits = value.toString().padStart(6, "0");
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function hashPairingCode(code: string): string {
  return crypto.createHash("sha256").update(normalizePairingCode(code)).digest("hex");
}

export function normalizePairingCode(code: string): string {
  return code.replace(/[^0-9]/g, "");
}

export function pairingCodeExpiresAt(now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCMinutes(expires.getUTCMinutes() + 10);
  return expires.toISOString();
}
