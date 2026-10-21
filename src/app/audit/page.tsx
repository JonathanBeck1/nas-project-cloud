import React from "react";
import { notFound } from "next/navigation";
import { AuditLogWorkspace } from "@/components/workspace/AuditLogWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { AUDIT_PAGE_SIZE } from "@/lib/server/audit";
import { isAdmin } from "@/lib/server/auth/access";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await requirePageSession();
  if (!isAdmin(session)) {
    notFound();
  }
  const { repo } = session;
  const current = repo.listTeamMembers().map(({ id, name, email }) => ({ id, name, email }));
  const removed = repo
    .listAuditPeople()
    .filter((person) => !current.some((member) => member.id === person.id))
    .map((person) => ({ ...person, name: "Removed account" }));

  return (
    <WorkspaceFrame admin projects={repo.listProjects()} activeHref="/audit">
      <AuditLogWorkspace
        initial={repo.listAuditEvents({ limit: AUDIT_PAGE_SIZE })}
        people={[...current, ...removed]}
      />
    </WorkspaceFrame>
  );
}
