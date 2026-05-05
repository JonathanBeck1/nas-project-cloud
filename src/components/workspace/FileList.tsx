import React from "react";
import { Download, File } from "lucide-react";
import type { CloudFile } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

type FileListProps = {
  files: CloudFile[];
  emptyTitle: string;
  emptyMessage: string;
};

export function FileList({ files, emptyTitle, emptyMessage }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/70 px-4 py-8 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-line bg-panel text-accent">
          <File aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-sm font-semibold text-ink">{emptyTitle}</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <ul className="divide-y divide-line" aria-label="Files">
        {files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
              <p className="mt-1 truncate text-xs text-muted">
                {formatBytes(file.sizeBytes)} | {file.family} | {file.sourceDevice}
              </p>
            </div>
            {file.status === "active" ? (
              <a
                href={`/api/files/${encodeURIComponent(file.id)}/download`}
                className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                Download
              </a>
            ) : (
              <span className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                Archived
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
