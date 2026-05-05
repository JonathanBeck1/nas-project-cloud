"use client";

import React, { useEffect, useState } from "react";
import { RotateCw, UploadCloud, XCircle } from "lucide-react";
import { abortUploadSession, listOpenUploadSessions } from "@/lib/client/uploadSessions";
import type { UploadSession } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

type UploadCenterProps = {
  initialSessions?: UploadSession[];
};

export function UploadCenter({ initialSessions }: UploadCenterProps) {
  const [sessions, setSessions] = useState<UploadSession[]>(initialSessions ?? []);
  const [isLoading, setIsLoading] = useState(initialSessions === undefined);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSessions() {
    setIsLoading(true);
    setError("");
    try {
      setSessions(await listOpenUploadSessions());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load uploads");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (initialSessions === undefined) {
      void loadSessions();
    }
  }, [initialSessions]);

  async function abortSession(session: UploadSession) {
    setBusySessionId(session.id);
    setMessage("");
    setError("");

    try {
      await abortUploadSession(session.id);
      setSessions((currentSessions) => currentSessions.filter((candidate) => candidate.id !== session.id));
      setMessage(`Aborted ${session.filename}`);
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : "Could not abort upload");
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="upload-center-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Transfer Queue</p>
          <h2 id="upload-center-heading" className="mt-1 text-base font-semibold text-ink">
            Upload Center
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
        >
          <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {message ? (
        <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {isLoading ? (
          <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">Loading uploads...</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface/70 px-4 py-6 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-line bg-panel text-accent">
              <UploadCloud aria-hidden="true" className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">No open uploads</p>
            <p className="mt-1 text-sm leading-6 text-muted">Interrupted large transfers will appear here while they can be cleaned up.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Open uploads">
            {sessions.map((session) => (
              <li key={session.id} className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{session.filename}</p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {formatBytes(session.receivedBytes)} / {formatBytes(session.sizeBytes)}
                    </span>
                    <span className="truncate">{session.sourceDevice}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void abortSession(session)}
                  disabled={busySessionId === session.id}
                  aria-label={`Abort ${session.filename}`}
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  Abort
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
