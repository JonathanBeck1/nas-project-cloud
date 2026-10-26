import React from "react";
import { notFound } from "next/navigation";
import { ProjectMembersCard } from "@/components/workspace/ProjectMembersCard";
import { ProjectSettingsCard } from "@/components/workspace/ProjectSettingsCard";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { isAdmin, projectAccess, visibleTo } from "@/lib/server/auth/access";
import { requirePageSession } from "@/lib/server/pageSession";
import { loadProjectWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await requirePageSession();
  const { db, repo } = session;
  const { id } = await params;
  const access = projectAccess(repo, session, id);
  if (!access) {
    notFound();
  }
  const data = loadProjectWorkspaceData(id, db);
  if (!data) {
    notFound();
  }

  return (
    <WorkspaceFrame admin={isAdmin(session)} projects={repo.listProjects(visibleTo(session))} activeHref={`/projects/${id}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <ProjectWorkspace
          project={data.project}
          files={data.files}
          categories={data.categories}
          tags={data.tags}
          canEdit={access === "edit"}
        />
        {isAdmin(session) ? (
          <>
            <ProjectMembersCard
              projectId={data.project.id}
              members={repo.listProjectMembers(data.project.id)}
              people={repo.listTeamMembers().filter((person) => person.role === "member" && !person.disabled)}
            />
            <ProjectSettingsCard
              project={data.project}
              categories={data.categories}
              fileCount={data.files.length}
            />
          </>
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}
