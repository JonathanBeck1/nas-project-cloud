import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import {
  hashSessionToken,
  sessionCookieName,
  sessionExpiresAt,
  shouldTouchSession
} from "./sessions";
import { isMutatingMethod, verifyCsrfToken } from "./csrf";

export type ApiSessionResult =
  | { ok: true; userId: string; sessionId: string; deviceId: string | null }
  | { ok: false; response: NextResponse };

export async function requireApiSession(request: Request): Promise<ApiSessionResult> {
  const token = sessionTokenFromRequest(request);
  if (!token) {
    return unauthorized();
  }

  const repo = createMetadataRepository(getDatabase());
  const session = repo.getSessionByTokenHash(hashSessionToken(token));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    return unauthorized();
  }

  if (isMutatingMethod(request.method) && !verifyCsrfToken(request)) {
    return csrfFailure();
  }

  slideSession(repo, session);

  return {
    ok: true,
    userId: session.userId,
    sessionId: session.id,
    deviceId: session.deviceId
  };
}

type SlideRepo = {
  touchSession: (id: string, expiresAt: string, lastSeenAt?: string) => void;
  touchDevice: (deviceId: string, lastSeenAt?: string) => void;
};

type SlideSession = {
  id: string;
  deviceId: string | null;
  lastSeenAt: string;
};

function slideSession(repo: SlideRepo, session: SlideSession): void {
  if (!shouldTouchSession(session.lastSeenAt)) return;
  const now = new Date();
  const nowIso = now.toISOString();
  repo.touchSession(session.id, sessionExpiresAt(now), nowIso);
  if (session.deviceId) {
    repo.touchDevice(session.deviceId, nowIso);
  }
}

function sessionTokenFromRequest(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (name === sessionCookieName) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        // Bad percent-encoding: not a token we issued, so the request is simply unauthenticated.
        return "";
      }
    }
  }
  return "";
}

function unauthorized(): ApiSessionResult {
  return {
    ok: false,
    response: NextResponse.json({ error: "authentication required" }, { status: 401 })
  };
}

function csrfFailure(): ApiSessionResult {
  return {
    ok: false,
    response: NextResponse.json({ error: "invalid csrf token" }, { status: 403 })
  };
}
