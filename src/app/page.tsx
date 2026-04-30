import React from "react";
import { AppShell } from "@/components/workspace/AppShell";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

export default function Home() {
  return <AppShell initialData={loadWorkspaceData()} />;
}
