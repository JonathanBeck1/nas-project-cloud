import React from "react";
import { Info } from "lucide-react";
import type { CloudFile, Project } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

type DetailDrawerProps = {
  file: CloudFile | null;
  projects?: Project[];
  isBusy?: boolean;
  onArchive?: (file: CloudFile) => void;
  onAssignProject?: (file: CloudFile, projectId: string) => void;
};

export function DetailDrawer({ file, projects = [], isBusy = false, onArchive, onAssignProject }: DetailDrawerProps) {
  if (!file) {
    return (
      <aside className="h-full rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="File details">
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-muted">
            <Info aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-ink">File details</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Select a file to inspect its project metadata.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="File details">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Selected File</p>
        <h2 className="mt-2 truncate text-base font-semibold text-ink">{file.name}</h2>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-white"
          href={`/api/files/${encodeURIComponent(file.id)}/download`}
        >
          Download
        </a>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => onArchive?.(file)}
          disabled={isBusy}
        >
          Archive
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => copyPath(file.storagePath)}
        >
          Copy path
        </button>
      </div>

      <label className="mt-4 block text-sm font-semibold text-ink">
        Project
        <select
          className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={file.projectId ?? ""}
          onChange={(event) => onAssignProject?.(file, event.target.value)}
          disabled={isBusy}
        >
          <option value="">Inbox</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
        <DetailRow label="Size" value={formatBytes(file.sizeBytes)} />
        <DetailRow label="Source" value={file.sourceDevice} />
        <DetailRow label="Path" value={file.storagePath} wrap />
        <DetailRow label="Family" value={file.family} />
        <DetailRow label="Extension" value={file.extension || "None"} />
        <DetailRow label="Category" value={file.categoryId ?? "Unsorted"} />
        <DetailRow label="Project" value={file.projectId ?? "Inbox"} />
        <DetailRow label="Updated" value={new Date(file.updatedAt).toLocaleDateString()} />
      </dl>
    </aside>
  );
}

function copyPath(path: string) {
  void navigator.clipboard?.writeText(path).catch(() => undefined);
}

function DetailRow({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 font-medium text-ink ${wrap ? "break-words" : "truncate"}`}>{value}</dd>
    </div>
  );
}
