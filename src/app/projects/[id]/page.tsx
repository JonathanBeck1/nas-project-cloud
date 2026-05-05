import React from "react";
import { notFound } from "next/navigation";
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
      <ProjectWorkspace project={data.project} files={data.files} categories={data.categories} tags={data.tags} />
    </WorkspaceFrame>
  );
}
