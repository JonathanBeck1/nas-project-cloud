import { NextResponse } from "next/server";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";
import { hashPairingCode } from "@/lib/server/auth/pairing";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { clientIpFromRequest, createRateLimiter } from "@/lib/server/rateLimit";

const PAIR_SHORT_WINDOW_MS = 10 * 60 * 1000;
const PAIR_SHORT_MAX = 5;
const PAIR_LONG_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAIR_LONG_MAX = 50;

export async function POST(request: Request) {
  const body = await jsonBody(request);
  if (!body) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 400 });
  }

  const code = stringValue(body.pairingCode);
  if (!code) {
    return NextResponse.json({ error: "invalid pairing code" }, { status: 400 });
  }

  const limiter = createRateLimiter();
  const ip = clientIpFromRequest(request);

  const longWindow = limiter.consume({
    bucket: "pair_ip_day",
    key: ip,
    max: PAIR_LONG_MAX,
    windowMs: PAIR_LONG_WINDOW_MS
  });
  if (!longWindow.allowed) {
    return rateLimited(longWindow.retryAfterSeconds);
  }

  const shortWindow = limiter.consume({
    bucket: "pair_ip_short",
    key: ip,
    max: PAIR_SHORT_MAX,
    windowMs: PAIR_SHORT_WINDOW_MS
  });
  if (!shortWindow.allowed) {
    return rateLimited(shortWindow.retryAfterSeconds);
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

  // Successful pair — release this IP from the short-window throttle.
  limiter.reset("pair_ip_short", ip);

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

function rateLimited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "too many requests", retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) }
    }
  );
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
