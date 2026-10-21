import React from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { isAdmin, viewOnlyProjectIds, visibleTo } from "@/lib/server/auth/access";
import { requirePageSession } from "@/lib/server/pageSession";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requirePageSession();
  const { db, repo, userId, deviceId } = session;
  const data = loadWorkspaceData(db, { userId, deviceId, visibleTo: visibleTo(session) });
  return (
    <AppShell
      admin={isAdmin(session)}
      initialData={data}
      viewOnlyProjectIds={viewOnlyProjectIds(repo, session, data.projects)}
    />
  );
}
