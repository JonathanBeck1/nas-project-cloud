import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { requireApiSession } from "@/lib/server/auth/guards";
import { createRecoveryCodes, hashRecoveryCode } from "@/lib/server/auth/recoveryCodes";
import { checkTotpCode, consumeCodeAttempt } from "@/lib/server/auth/twoFactor";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

// A stolen session alone can't mint codes that outlive it: a current code from the authenticator is required.
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const raw = await readLimitedBody(request, SMALL_BODY_MAX_BYTES);
  if (!raw) {
    return bodyTooLarge(SMALL_BODY_MAX_BYTES);
  }
  const body = parseJsonObject(raw);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const attempt = consumeCodeAttempt(auth.userId);
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "too many requests", retryAfterSeconds: attempt.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(Math.max(1, attempt.retryAfterSeconds)) } }
    );
  }

  const repo = createMetadataRepository(getDatabase());
  if (!checkTotpCode(repo, auth.userId, typeof body.code === "string" ? body.code : "")) {
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  }

  const recoveryCodes = createRecoveryCodes();
  repo.replaceRecoveryCodes(auth.userId, recoveryCodes.map(hashRecoveryCode));
  recordAudit(request, { userId: auth.userId, action: "recovery_codes_replaced" });
  return NextResponse.json({ recoveryCodes });
}
