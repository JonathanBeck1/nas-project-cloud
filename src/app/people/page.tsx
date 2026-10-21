import React from "react";
import { notFound } from "next/navigation";
import { PeopleWorkspace } from "@/components/workspace/PeopleWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { isAdmin } from "@/lib/server/auth/access";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const session = await requirePageSession();
  if (!isAdmin(session)) {
    notFound();
  }
  const { repo } = session;

  return (
    <WorkspaceFrame admin projects={repo.listProjects()} activeHref="/people">
      <PeopleWorkspace
        people={repo.listTeamMembers()}
        invites={repo.listPendingInvites()}
        viewer={{ id: session.userId, role: session.role }}
      />
    </WorkspaceFrame>
  );
}
