import React from "react";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { TagManager } from "@/components/workspace/TagManager";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const { db, repo } = await requirePageSession();
  const projects = repo.listProjects();
  const tags = repo.listTags();

  const usageRows = db
    .prepare<[], { tag_id: string; file_count: number }>(
      "select tag_id, count(*) as file_count from file_tags group by tag_id"
    )
    .all();

  const usage = usageRows.map((row) => ({ tagId: row.tag_id, fileCount: row.file_count }));

  return (
    <WorkspaceFrame projects={projects} activeHref="/tags">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Organization</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Tags</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Tags cut across projects and categories. Mark files with a tag from the file detail panel; remove a tag here to detach it from every file at once.
          </p>
        </section>

        <TagManager tags={tags} usage={usage} />
      </div>
    </WorkspaceFrame>
  );
}
