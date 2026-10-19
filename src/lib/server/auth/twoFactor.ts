import qrcode from "qrcode-generator";
import type { createMetadataRepository } from "@/lib/server/metadata";
import { createRateLimiter } from "@/lib/server/rateLimit";
import { hashRecoveryCode } from "./recoveryCodes";
import { base32Decode, verifyTotp } from "./totp";

const CODE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const CODE_ATTEMPTS_PER_USER = 10;

type Repo = ReturnType<typeof createMetadataRepository>;

export function checkTotpCode(repo: Repo, userId: string, code: string): boolean {
  const state = repo.getTwoFactorState(userId);
  if (!state?.enabled || !state.secret) return false;
  const step = verifyTotp(base32Decode(state.secret), code, { lastUsedStep: state.lastStep });
  return step !== null && repo.recordTotpStep(userId, step);
}

export function checkRecoveryCode(repo: Repo, userId: string, code: string): boolean {
  return code.length > 0 && repo.useRecoveryCode(userId, hashRecoveryCode(code));
}

// One budget per account, shared by every route that checks a code, so guesses can't be spread across them.
export function consumeCodeAttempt(userId: string) {
  return createRateLimiter().consume({
    bucket: "two_factor",
    key: userId,
    max: CODE_ATTEMPTS_PER_USER,
    windowMs: CODE_ATTEMPT_WINDOW_MS
  });
}

export function resetCodeAttempts(userId: string): void {
  createRateLimiter().reset("two_factor", userId);
}

export function qrCodeDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(4, 4);
}

export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}
