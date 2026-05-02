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

  const pairingCode = createPairingCode();
  const expiresAt = pairingCodeExpiresAt();
  const repo = createMetadataRepository(getDatabase());
  repo.createDevicePairingCode({
    userId: auth.userId,
    codeHash: hashPairingCode(pairingCode),
    deviceName,
    deviceKind,
    expiresAt
  });

  return NextResponse.json({ pairingCode, expiresAt }, { status: 201 });
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
