import React from "react";
import { Tags } from "lucide-react";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { repo } = await requirePageSession();
  const projects = repo.listProjects();
  const categories = repo.listCategories();
  const files = repo.listFiles();

  return (
    <WorkspaceFrame projects={projects} activeHref="/categories">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Organization</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Categories</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            System categories group files by broad workflow: CAD, media, documents, software, personal files, archive, and inbox.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => {
            const count = files.filter((file) => file.categoryId === category.id).length;
            return (
              <section key={category.id} className="rounded-md border border-line bg-panel p-4 shadow-panel">
                <div className="flex items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-white"
                    style={{ backgroundColor: category.color }}
                  >
                    <Tags aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">{category.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {count} {count === 1 ? "file" : "files"}
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      {category.isSystem ? "System category" : "Custom category"}
                    </p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </WorkspaceFrame>
  );
}
