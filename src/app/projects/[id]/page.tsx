import React from "react";
import { notFound } from "next/navigation";
import { ProjectSettingsCard } from "@/components/workspace/ProjectSettingsCard";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";
import { loadProjectWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { db, repo } = await requirePageSession();
  const { id } = await params;
  const data = loadProjectWorkspaceData(id, db);
  if (!data) {
    notFound();
  }

  return (
    <WorkspaceFrame projects={repo.listProjects()} activeHref={`/projects/${id}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <ProjectWorkspace project={data.project} files={data.files} categories={data.categories} tags={data.tags} />
        <ProjectSettingsCard
          project={data.project}
          categories={data.categories}
          fileCount={data.files.length}
        />
      </div>
    </WorkspaceFrame>
  );
}
