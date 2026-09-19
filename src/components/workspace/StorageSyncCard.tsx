"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FolderSync, RotateCw, Trash2 } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import { deleteFilePermanently } from "@/lib/client/fileActions";

type MissingFile = { id: string; name: string; storagePath: string };

type SyncResult = {
  scanned: number;
  indexed: number;
  relinked: number;
  restored: number;
  missing: number;
  deferred: number;
};

export function StorageSyncCard() {
  const [missingCount, setMissingCount] = useState(0);
  const [missingFiles, setMissingFiles] = useState<MissingFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    const response = await fetch("/api/maintenance/reconcile/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const json = (await response.json()) as { missingCount: number; missingFiles: MissingFile[] };
    setMissingCount(json.missingCount);
    setMissingFiles(json.missingFiles);
  }, []);

  useEffect(() => {
    fetchStatus().catch((statusError: unknown) =>
      setError(statusError instanceof Error ? `Could not load sync status: ${statusError.message}` : "Could not load sync status")
    );
  }, [fetchStatus]);

  async function syncNow() {
    setIsSyncing(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/maintenance/reconcile", { method: "POST", headers: { ...csrfHeaders() } });
      const json = (await response.json()) as SyncResult & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? `status ${response.status}`);
      }
      setMessage(describeResult(json));
      await fetchStatus();
    } catch (syncError) {
      setError(syncError instanceof Error ? `Sync failed: ${syncError.message}` : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  async function removeRecord(file: MissingFile) {
    if (!window.confirm(`Remove the record for ${file.name}? Its tags and share links are removed with it.`)) {
      return;
    }
    setError("");
    try {
      await deleteFilePermanently(file.id);
      await fetchStatus();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove record");
    }
  }

  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="storage-sync-heading">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <FolderSync aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="storage-sync-heading" className="text-sm font-semibold text-ink">
            Storage sync
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Brings the index in line with the disk after changes made over SMB. Moved or renamed files keep their tags,
            project, and share links; new files are indexed; files that are gone are listed here.
          </p>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={isSyncing}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCw aria-hidden="true" className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sync now
        </button>
      </div>

      {message ? (
        <p role="status" className="mt-3 text-xs font-medium text-accent">
          {message}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}

      {missingCount > 0 ? (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Missing from disk ({missingCount})
          </h3>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
            {missingFiles.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                  <p className="truncate text-xs text-muted">{file.storagePath}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeRecord(file)}
                  aria-label={`Remove record for ${file.name}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line bg-panel px-2 text-xs font-semibold text-ink transition hover:border-muted"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Remove record
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted">
            Putting a file back at its old path, or anywhere under the storage root with the same contents, restores it
            on the next sync.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function describeResult(result: SyncResult): string {
  const summary = `Scanned ${result.scanned}: ${result.indexed} indexed, ${result.relinked} relinked, ${result.restored} restored, ${result.missing} missing`;
  return result.deferred > 0
    ? `${summary}, ${result.deferred} deferred (still being copied, unreadable, or past this run's time limit). Sync again shortly.`
    : `${summary}.`;
}
