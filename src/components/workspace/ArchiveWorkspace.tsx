"use client";

import React, { useState } from "react";
import { ArchiveRestore, File, Trash2 } from "lucide-react";
import { deleteFilePermanently, restoreFile } from "@/lib/client/fileActions";
import type { CloudFile } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

type ArchiveWorkspaceProps = {
  initialFiles: CloudFile[];
};

export function ArchiveWorkspace({ initialFiles }: ArchiveWorkspaceProps) {
  const [files, setFiles] = useState(initialFiles);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  const handleRestore = async (file: CloudFile) => {
    setBusyFileId(file.id);
    setMessage("");
    setError("");

    try {
      await restoreFile(file.id);
      setFiles((currentFiles) => currentFiles.filter((candidate) => candidate.id !== file.id));
      setMessage(`Restored ${file.name}`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore file");
    } finally {
      setBusyFileId(null);
    }
  };

  const handlePermanentDelete = async (file: CloudFile) => {
    if (!window.confirm(`Permanently delete ${file.name}? This cannot be undone.`)) {
      return;
    }

    setBusyFileId(file.id);
    setMessage("");
    setError("");

    try {
      await deleteFilePermanently(file.id);
      setFiles((currentFiles) => currentFiles.filter((candidate) => candidate.id !== file.id));
      setMessage(`Deleted ${file.name}`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete file");
    } finally {
      setBusyFileId(null);
    }
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {files.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/70 px-4 py-8 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-md border border-line bg-panel text-accent">
            <File aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-ink">Archive is empty</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted">
            Archived files will appear here once you remove them from active project work.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
          <ul className="divide-y divide-line" aria-label="Archived files">
            {files.map((file) => {
              const isBusy = busyFileId === file.id;

              return (
                <li key={file.id} className="flex min-w-0 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {formatBytes(file.sizeBytes)} | {file.family} | {file.sourceDevice}
                    </p>
                    <p className="mt-1 break-words text-xs text-muted">{file.storagePath}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestore(file)}
                      disabled={isBusy}
                      aria-label={`Restore ${file.name}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePermanentDelete(file)}
                      disabled={isBusy}
                      aria-label={`Permanently delete ${file.name}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
