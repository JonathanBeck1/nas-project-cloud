import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/workspace/AppShell";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

export default async function Home() {
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

  return <AppShell initialData={loadWorkspaceData(db)} />;
}
