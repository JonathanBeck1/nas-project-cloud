import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { cookieFromRequest } from "@/lib/server/auth/guards";
import { clearLoginChallengeCookie, withSessionCookie } from "@/lib/server/auth/http";
import { hashSessionToken, loginChallengeCookieName, startBrowserSession } from "@/lib/server/auth/sessions";
import { checkRecoveryCode, checkTotpCode, consumeCodeAttempt, resetCodeAttempts } from "@/lib/server/auth/twoFactor";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

export async function POST(request: Request) {
  const raw = await readLimitedBody(request, SMALL_BODY_MAX_BYTES);
  if (!raw) {
    return bodyTooLarge(SMALL_BODY_MAX_BYTES);
  }
  const body = parseJsonObject(raw);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const token = cookieFromRequest(request, loginChallengeCookieName);
  const challenge = token ? repo.getLoginChallengeByTokenHash(hashSessionToken(token)) : null;
  if (!challenge || Date.parse(challenge.expiresAt) <= Date.now()) {
    return clearLoginChallengeCookie(
      NextResponse.json({ error: "sign-in expired, enter your password again" }, { status: 401 })
    );
  }

  const attempt = consumeCodeAttempt(challenge.userId);
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "too many requests", retryAfterSeconds: attempt.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(Math.max(1, attempt.retryAfterSeconds)) } }
    );
  }

  const code = stringValue(body.code);
  const recoveryCode = stringValue(body.recoveryCode);
  const valid = code
    ? checkTotpCode(repo, challenge.userId, code)
    : checkRecoveryCode(repo, challenge.userId, recoveryCode);
  // Deleting the challenge is what claims it, so one challenge can't become two sessions.
  if (!valid || !repo.deleteLoginChallenge(challenge.id)) {
    recordAudit(request, { userId: challenge.userId, action: "sign_in_failed", detail: { reason: "wrong code" } });
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  }
  resetCodeAttempts(challenge.userId);

  const user = repo.getUserById(challenge.userId);
  const sessionToken = startBrowserSession(repo, challenge.userId, challenge.deviceName);
  recordAudit(request, {
    userId: challenge.userId,
    action: "sign_in",
    detail: { method: code ? "authenticator code" : "recovery code" }
  });
  return clearLoginChallengeCookie(withSessionCookie(NextResponse.json({ user }), sessionToken));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
