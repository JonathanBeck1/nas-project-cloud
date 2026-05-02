import React from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import { hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { loadProjectWorkspaceData } from "@/lib/server/workspaceData";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
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

  const { id } = await params;
  const data = loadProjectWorkspaceData(id, db);
  if (!data) {
    notFound();
  }

  return <ProjectWorkspace project={data.project} files={data.files} categories={data.categories} tags={data.tags} />;
}
