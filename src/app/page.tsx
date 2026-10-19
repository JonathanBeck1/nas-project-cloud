import React from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { visibleTo } from "@/lib/server/auth/access";
import { requirePageSession } from "@/lib/server/pageSession";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requirePageSession();
  const { db, userId, deviceId } = session;
  return <AppShell initialData={loadWorkspaceData(db, { userId, deviceId, visibleTo: visibleTo(session) })} />;
}
