import React from "react";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { CategoryEditor } from "@/components/workspace/CategoryEditor";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { db, repo } = await requirePageSession();
  const projects = repo.listProjects();
  const categories = repo.listCategories();

  const usageRows = db
    .prepare<[], { category_id: string; file_count: number }>(
      "select category_id, count(*) as file_count from files where category_id is not null and status = 'active' group by category_id"
    )
    .all();

  const usage = usageRows.map((row) => ({ categoryId: row.category_id, fileCount: row.file_count }));

  return (
    <WorkspaceFrame projects={projects} activeHref="/categories">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Organization</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Categories</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Categories group files by broad workflow. The defaults cover the common ones; add custom categories
            here for anything specific to how you organize files. Deleting a custom category leaves its files
            uncategorized rather than removing them.
          </p>
        </section>

        <CategoryEditor categories={categories} usage={usage} />
      </div>
    </WorkspaceFrame>
  );
}
