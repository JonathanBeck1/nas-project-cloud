import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { requireMaintenanceToken } from "@/lib/server/auth/maintenance";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

// For an account that lost its authenticator and its recovery codes. Signs the account out everywhere.
export async function POST(request: Request) {
  const auth = requireMaintenanceToken(request);
  if (!auth.ok) {
    return auth.response;
  }

  const raw = await readLimitedBody(request, SMALL_BODY_MAX_BYTES);
  if (!raw) {
    return bodyTooLarge(SMALL_BODY_MAX_BYTES);
  }
  const body = parseJsonObject(raw);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const user = repo.getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "no account with that email" }, { status: 404 });
  }

  repo.resetTwoFactor(user.id);
  recordAudit(request, {
    userId: null,
    action: "two_factor_reset",
    target: { type: "user", id: user.id, label: user.email },
    detail: { via: "maintenance token" }
  });
  return NextResponse.json({ ok: true });
}
