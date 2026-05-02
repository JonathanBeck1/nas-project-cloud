import { NextResponse } from "next/server";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";
import { hashPairingCode } from "@/lib/server/auth/pairing";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 400 });
  }

  const code = stringValue(body.pairingCode);
  if (!code) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const pairing = repo.getDevicePairingCodeByHash(hashPairingCode(code));
  if (!pairing || pairing.consumedAt || Date.parse(pairing.expiresAt) <= Date.now()) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 401 });
  }

  const consumed = repo.consumeDevicePairingCode(pairing.id);
  if (!consumed) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 401 });
  }

  const device = repo.createDevice({
    userId: pairing.userId,
    name: pairing.deviceName,
    kind: pairing.deviceKind
  });
  const token = createSessionToken();
  repo.createSession({
    userId: pairing.userId,
    deviceId: device.id,
    tokenHash: hashSessionToken(token),
    expiresAt: sessionExpiresAt()
  });

  return withSessionCookie(NextResponse.json({ device }), token);
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
