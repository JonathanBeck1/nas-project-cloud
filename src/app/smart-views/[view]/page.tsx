import React from "react";
import { notFound } from "next/navigation";
import { FileList } from "@/components/workspace/FileList";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";
import { listSmartViewFiles } from "@/lib/server/smartViews";
import { SMART_VIEWS } from "@/lib/shared/defaults";
import type { SmartViewKey } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

type SmartViewPageProps = {
  params: Promise<{ view: string }>;
};

export default async function SmartViewPage({ params }: SmartViewPageProps) {
  const { view } = await params;
  const definition = SMART_VIEWS.find((candidate) => candidate.key === view);
  if (!definition) {
    notFound();
  }

  const { db, repo } = await requirePageSession();
  const projects = repo.listProjects();
  const { files, truncated } = listSmartViewFiles(db, view as SmartViewKey);

  return (
    <WorkspaceFrame projects={projects} activeHref={`/smart-views/${view}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Smart View</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{definition.name}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{definition.description}</p>
        </section>

        {truncated ? (
          <p
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
          >
            Showing the newest {files.length} files in this view. Use search to find older ones.
          </p>
        ) : null}

        <FileList
          files={files}
          emptyTitle="No matching files"
          emptyMessage="Files will appear here automatically when they match this smart view."
        />
      </div>
    </WorkspaceFrame>
  );
}
