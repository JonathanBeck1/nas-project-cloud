import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { hashPassword } from "@/lib/server/auth/passwords";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = stringValue(body.email).toLowerCase();
  const name = stringValue(body.name);
  const password = stringValue(body.password);
  const deviceName = stringValue(body.deviceName) || "Browser";

  if (!email || !name || password.length < 12) {
    return NextResponse.json({ error: "email, name, and a 12 character password are required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  if (repo.countUsers() > 0) {
    return NextResponse.json({ error: "owner already exists" }, { status: 409 });
  }

  const user = repo.createUser({
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "owner"
  });
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
