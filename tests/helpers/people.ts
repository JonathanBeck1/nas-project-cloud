import { createSessionToken, hashSessionToken, sessionExpiresAt } from "@/lib/server/auth/sessions";
import type { AppDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { UserRole } from "@/lib/shared/types";
import { Jar } from "./routeClient";

export type Person = { id: string; email: string; jar: Jar };

// A user who is already signed in with two-factor on, so tests can go straight to the routes under test.
export function signedInPerson(db: AppDatabase, role: UserRole, name: string, passwordHash = "x"): Person {
  const repo = createMetadataRepository(db);
  const email = `${name}@example.test`;
  const user = repo.createUser({ email, name, passwordHash, role });
  db.prepare("update users set totp_enabled_at = ? where id = ?").run(new Date().toISOString(), user.id);
  const token = createSessionToken();
  repo.createSession({ userId: user.id, tokenHash: hashSessionToken(token), expiresAt: sessionExpiresAt() });
  const jar = new Jar();
  jar.cookies.set("nas_cloud_session", token);
  jar.cookies.set("nas_cloud_csrf", "csrf-token-for-tests");
  return { id: user.id, email, jar };
}
