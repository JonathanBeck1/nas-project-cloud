import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";
import { type AppDatabase, getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export type PageSession = {
  db: AppDatabase;
  repo: ReturnType<typeof createMetadataRepository>;
  userId: string;
  sessionId: string;
  deviceId: string | null;
};

export async function requirePageSession(): Promise<PageSession> {
  const db = getDatabase();
  const repo = createMetadataRepository(db);
  if (repo.countUsers() === 0) {
    redirect("/setup");
  }

  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) {
    redirect("/login");
  }

  const session = repo.getSessionByTokenHash(hashSessionToken(token));
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    redirect("/login");
  }

  return {
    db,
    repo,
    userId: session.userId,
    sessionId: session.id,
    deviceId: session.deviceId
  };
}
