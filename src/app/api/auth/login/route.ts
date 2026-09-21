import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { DUMMY_PASSWORD_HASH, hashPassword, needsRehash, verifyPassword } from "@/lib/server/auth/passwords";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import { withSessionCookie } from "@/lib/server/auth/http";
import { clientIpFromRequest, createRateLimiter } from "@/lib/server/rateLimit";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PER_EMAIL_MAX = 10;
const LOGIN_PER_IP_MAX = 60;

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

  const limiter = createRateLimiter();
  const ip = clientIpFromRequest(request);

  const ipResult = limiter.consume({
    bucket: "login_ip",
    key: ip,
    max: LOGIN_PER_IP_MAX,
    windowMs: LOGIN_WINDOW_MS
  });
  if (!ipResult.allowed) {
    return rateLimited(ipResult.retryAfterSeconds);
  }

  const emailResult = limiter.consume({
    bucket: "login_email",
    key: email,
    max: LOGIN_PER_EMAIL_MAX,
    windowMs: LOGIN_WINDOW_MS
  });
  if (!emailResult.allowed) {
    return rateLimited(emailResult.retryAfterSeconds);
  }

  const repo = createMetadataRepository(getDatabase());
  const user = repo.getUserByEmail(email);
  // Derive even for an unknown email, so response time does not reveal which accounts exist.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  if (needsRehash(user.passwordHash)) {
    repo.updateUserPasswordHash(user.id, await hashPassword(password));
  }

  // Successful login — clear any throttling state for this identity.
  limiter.reset("login_email", email);
  limiter.reset("login_ip", ip);

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

  return withSessionCookie(
    NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }),
    token
  );
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
