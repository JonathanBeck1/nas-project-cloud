import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { hashPassword } from "@/lib/server/auth/passwords";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";
import { normalizeSetupCode } from "@/lib/server/auth/setupCode";
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

  const email = stringValue(body.email).toLowerCase();
  const name = stringValue(body.name);
  const password = stringValue(body.password);
  const deviceName = stringValue(body.deviceName) || "Browser";
  const setupCode = normalizeSetupCode(stringValue(body.setupCode));

  if (!email || !name || password.length < 12) {
    return NextResponse.json({ error: "email, name, and a 12 character password are required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  if (repo.countUsers() > 0) {
    return NextResponse.json({ error: "owner already exists" }, { status: 409 });
  }

  // The code is printed only in the app's log, so a LAN client or a cross-site form can't claim a fresh install.
  if (!setupCode || !repo.hasSetupCode(setupCode)) {
    return NextResponse.json({ error: "setup code is wrong" }, { status: 403 });
  }

  // The checks above only save a derivation; this insert is what decides, because hashing yields to other requests.
  const user = repo.createFirstOwner({ email, name, passwordHash: await hashPassword(password), setupCode });
  if (!user) {
    return NextResponse.json({ error: "owner already exists" }, { status: 409 });
  }
  const device = repo.createDevice({
    userId: user.id,
    name: deviceName,
    kind: "browser"
  });
  const token = createSessionToken();
  repo.createSession({
    userId: user.id,
    deviceId: device.id,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiresAt()
  });

  return withSessionCookie(NextResponse.json({ user }, { status: 201 }), token);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
