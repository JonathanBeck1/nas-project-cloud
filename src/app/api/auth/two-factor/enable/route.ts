import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { requireApiSession } from "@/lib/server/auth/guards";
import { createRecoveryCodes, hashRecoveryCode } from "@/lib/server/auth/recoveryCodes";
import { base32Decode, verifyTotp } from "@/lib/server/auth/totp";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

export async function POST(request: Request) {
  const auth = await requireApiSession(request, { allowWithoutTwoFactor: true });
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

  const repo = createMetadataRepository(getDatabase());
  const state = repo.getTwoFactorState(auth.userId);
  if (state?.enabled) {
    return NextResponse.json({ error: "two-factor is already on" }, { status: 409 });
  }
  if (!state?.pendingSecret) {
    return NextResponse.json({ error: "start setup first" }, { status: 400 });
  }

  const step = verifyTotp(base32Decode(state.pendingSecret), typeof body.code === "string" ? body.code : "");
  if (step === null) {
    return NextResponse.json({ error: "that code doesn't match, check the time on your phone" }, { status: 400 });
  }

  const recoveryCodes = createRecoveryCodes();
  const enabled = repo.enableTwoFactor({
    userId: auth.userId,
    step,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    keepSessionId: auth.sessionId
  });
  if (!enabled) {
    return NextResponse.json({ error: "two-factor is already on" }, { status: 409 });
  }

  recordAudit(request, { userId: auth.userId, action: "two_factor_enabled" });
  return NextResponse.json({ recoveryCodes });
}
