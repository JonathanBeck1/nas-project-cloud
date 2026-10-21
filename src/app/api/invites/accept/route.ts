import { NextResponse } from "next/server";
import { withSessionCookie } from "@/lib/server/auth/http";
import { hashPassword } from "@/lib/server/auth/passwords";
import { hashSessionToken, startBrowserSession } from "@/lib/server/auth/sessions";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { clientIpFromRequest, createRateLimiter } from "@/lib/server/rateLimit";
import { SMALL_BODY_MAX_BYTES, bodyTooLarge, parseJsonObject, readLimitedBody } from "@/lib/server/requestBody";

const ACCEPT_WINDOW_MS = 15 * 60 * 1000;
const ACCEPT_PER_IP_MAX = 20;

// Public: the invite link is the credential. The new account signs in without two-factor, so it can reach only setup.
export async function POST(request: Request) {
  const limit = createRateLimiter().consume({
    bucket: "invite_accept",
    key: clientIpFromRequest(request),
    max: ACCEPT_PER_IP_MAX,
    windowMs: ACCEPT_WINDOW_MS
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too many requests", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(Math.max(1, limit.retryAfterSeconds)) } }
    );
  }

  const raw = await readLimitedBody(request, SMALL_BODY_MAX_BYTES);
  if (!raw) {
    return bodyTooLarge(SMALL_BODY_MAX_BYTES);
  }
  const body = parseJsonObject(raw);
  if (!body) {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const token = stringValue(body.token);
  const email = stringValue(body.email).toLowerCase();
  const name = stringValue(body.name);
  const password = stringValue(body.password);
  const deviceName = stringValue(body.deviceName) || "Browser";
  if (!token || !email || !name || password.length < 12) {
    return NextResponse.json({ error: "email, name, and a 12 character password are required" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const tokenHash = hashSessionToken(token);
  if (!repo.getPendingInvite({ tokenHash })) {
    return NextResponse.json({ error: "this invite has expired or was already used" }, { status: 404 });
  }
  if (repo.getUserByEmail(email)) {
    return NextResponse.json({ error: "an account with that email already exists" }, { status: 409 });
  }

  let user;
  try {
    // Hashing yields to other requests, so acceptInvite decides atomically whether the link is still unused.
    user = repo.acceptInvite({ tokenHash, email, name, passwordHash: await hashPassword(password) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "an account with that email already exists" }, { status: 409 });
    }
    throw error;
  }
  if (!user) {
    return NextResponse.json({ error: "this invite has expired or was already used" }, { status: 404 });
  }

  return withSessionCookie(NextResponse.json({ user }, { status: 201 }), startBrowserSession(repo, user.id, deviceName));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
