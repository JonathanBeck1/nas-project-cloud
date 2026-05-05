import React from "react";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { repo } = await requirePageSession();
  const projects = repo.listProjects();
  const files = repo.listFiles();

  return (
    <WorkspaceFrame projects={projects} activeHref="/projects">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader title="Projects" eyebrow="Workspaces" description="Organize NAS files around builds, clients, prints, repairs, and recurring work." />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {projects.map((project) => {
            const projectFiles = files.filter((file) => file.projectId === project.id);
            return (
              <Link
                key={project.id}
                href={`/projects/${encodeURIComponent(project.id)}`}
                className="rounded-md border border-line bg-panel p-4 shadow-panel transition hover:border-muted"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
                    <FolderKanban aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">{project.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                      {project.description || "No description yet"}
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      {projectFiles.length} {projectFiles.length === 1 ? "file" : "files"}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {projects.length === 0 ? (
          <EmptyPanel title="No projects yet" message="Create a project from Inbox to start turning loose uploads into organized workspaces." />
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
    </section>
  );
}

function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-panel px-4 py-8 text-center shadow-panel">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">{message}</p>
    </div>
  );
}
