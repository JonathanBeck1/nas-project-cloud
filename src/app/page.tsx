import React from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { requirePageSession } from "@/lib/server/pageSession";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { db, userId, deviceId } = await requirePageSession();
  return <AppShell initialData={loadWorkspaceData(db, { userId, deviceId })} />;
}
