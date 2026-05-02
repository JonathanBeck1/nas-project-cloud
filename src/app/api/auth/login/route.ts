import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { verifyPassword } from "@/lib/server/auth/passwords";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = stringValue(body.email).toLowerCase();
  const password = stringValue(body.password);
  const deviceName = stringValue(body.deviceName) || "Browser";
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const user = repo.getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
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

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return withSessionCookie(NextResponse.json({ user: safeUser }), token);
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
