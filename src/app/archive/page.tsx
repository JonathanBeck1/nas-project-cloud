import React from "react";
import { Archive } from "lucide-react";
import { ArchiveWorkspace } from "@/components/workspace/ArchiveWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const { repo } = await requirePageSession();
  const projects = repo.listProjects();
  const archivedFiles = repo.listFiles({ status: "archived" });

  return (
    <WorkspaceFrame projects={projects} activeHref="/archive">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
              <Archive aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Recovery</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">Archive</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Archived files are kept out of active views while preserving their metadata and storage location.
              </p>
            </div>
          </div>
        </section>

        <ArchiveWorkspace initialFiles={archivedFiles} />
      </div>
    </WorkspaceFrame>
  );
}
