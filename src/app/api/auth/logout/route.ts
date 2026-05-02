import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { clearSessionCookie } from "@/lib/server/auth/http";
import { hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";

export async function POST() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (token) {
    const repo = createMetadataRepository(getDatabase());
    const session = repo.getSessionByTokenHash(hashSessionToken(token));
    if (session) {
      repo.deleteSession(session.id);
    }
  }

  return clearSessionCookie(NextResponse.json({ ok: true }));
}
