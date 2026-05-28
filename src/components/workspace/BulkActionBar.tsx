import React, { useState } from "react";
import { Archive, Check, Download, X } from "lucide-react";
import type { Category, Project } from "@/lib/shared/types";

type BulkActionBarProps = {
  selectedCount: number;
  projects?: Project[];
  categories?: Category[];
  isBusy?: boolean;
  downloadHref?: string;
  onArchive: () => void;
  onApplyOrganization?: (input: { projectId: string | null; categoryId: string | null }) => void;
  onClearSelection: () => void;
};

export function BulkActionBar({
  selectedCount,
  projects = [],
  categories = [],
  isBusy = false,
  downloadHref,
  onArchive,
  onApplyOrganization,
  onClearSelection
}: BulkActionBarProps) {
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel px-3 py-2 shadow-panel">
      <span className="text-sm font-semibold text-ink">{selectedCount} selected</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        <label className="min-w-[160px] text-xs font-semibold text-muted">
          Project for selected files
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={isBusy}
            className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs font-medium text-ink"
          >
            <option value="">Inbox</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] text-xs font-semibold text-muted">
          Category for selected files
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={isBusy}
            className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-xs font-medium text-ink"
          >
            <option value="">Unsorted</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onApplyOrganization?.({ projectId: projectId || null, categoryId: categoryId || null })}
          disabled={isBusy || !onApplyOrganization}
          className="inline-flex h-8 items-center gap-2 self-end rounded-md border border-line bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check aria-hidden="true" className="h-4 w-4" />
          Apply organization
        </button>
        {downloadHref ? (
          <a
            href={downloadHref}
            className="inline-flex h-8 items-center gap-2 self-end rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download ZIP
          </a>
        ) : null}
        <button
          type="button"
          onClick={onArchive}
          disabled={isBusy}
          className="inline-flex h-8 items-center gap-2 self-end rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Archive aria-hidden="true" className="h-4 w-4" />
          Archive
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={isBusy}
          className="inline-flex h-8 items-center gap-2 self-end rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          Clear selection
        </button>
      </div>
    </div>
  );
}
