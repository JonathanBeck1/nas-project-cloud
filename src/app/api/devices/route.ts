import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { createPairingCode, hashPairingCode, pairingCodeExpiresAt } from "@/lib/server/auth/pairing";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { TrustedDeviceKind } from "@/lib/shared/types";

const allowedDeviceKinds = new Set<TrustedDeviceKind>(["browser", "desktop", "mobile", "cli"]);

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ devices: repo.listDevices(auth.userId) });
}

const PAIRING_CODE_DRAWS = 5;

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await jsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid device pairing request" }, { status: 400 });
  }

  const deviceName = stringValue(body.deviceName);
  const deviceKind = stringValue(body.deviceKind) as TrustedDeviceKind;
  if (!deviceName || !allowedDeviceKinds.has(deviceKind)) {
    return NextResponse.json({ error: "invalid device pairing request" }, { status: 400 });
  }

  const expiresAt = pairingCodeExpiresAt();
  const repo = createMetadataRepository(getDatabase());

  // Six digits can collide with another live code; draw again rather than fail.
  for (let attempt = 1; ; attempt += 1) {
    const pairingCode = createPairingCode();
    try {
      repo.createDevicePairingCode({
        userId: auth.userId,
        codeHash: hashPairingCode(pairingCode),
        deviceName,
        deviceKind,
        expiresAt
      });
      return NextResponse.json({ pairingCode, expiresAt }, { status: 201 });
    } catch (error) {
      const collided = error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
      if (!collided || attempt >= PAIRING_CODE_DRAWS) {
        throw error;
      }
    }
  }
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
