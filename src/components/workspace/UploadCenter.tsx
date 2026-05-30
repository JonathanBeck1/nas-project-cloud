"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCopy, RotateCw, UploadCloud, XCircle } from "lucide-react";
import {
  abortUploadSession,
  listUploadSessions,
  resumeUploadSession,
  type UploadSessionStatusFilter
} from "@/lib/client/uploadSessions";
import type { CloudFile, UploadSession } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

const TAB_STORAGE_KEY = "nas-cloud:upload-center:tab";
const DEVICE_STORAGE_KEY = "nas-cloud:upload-center:device";
const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const TABS: { id: UploadSessionStatusFilter; label: string }[] = [
  { id: "open", label: "Active" },
  { id: "failed", label: "Failed" },
  { id: "aborted", label: "Aborted" }
];

type UploadCenterProps = {
  initialSessions?: UploadSession[];
  onUploaded?: (files: CloudFile[]) => void;
};

export function UploadCenter({ initialSessions, onUploaded }: UploadCenterProps) {
  const [activeTab, setActiveTab] = useState<UploadSessionStatusFilter>("open");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [sessions, setSessions] = useState<UploadSession[]>(initialSessions ?? []);
  const [knownDevices, setKnownDevices] = useState<string[]>(() =>
    deriveDevices(initialSessions ?? [])
  );
  const [isLoading, setIsLoading] = useState(initialSessions === undefined);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hasHydratedPreferencesRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = window.localStorage.getItem(TAB_STORAGE_KEY) as UploadSessionStatusFilter | null;
    if (tab && TABS.some((entry) => entry.id === tab)) {
      setActiveTab(tab);
    }
    const device = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (device) {
      setDeviceFilter(device);
    }
    hasHydratedPreferencesRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedPreferencesRef.current || typeof window === "undefined") return;
    window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!hasHydratedPreferencesRef.current || typeof window === "undefined") return;
    window.localStorage.setItem(DEVICE_STORAGE_KEY, deviceFilter);
  }, [deviceFilter]);

  async function loadSessions(
    nextTab: UploadSessionStatusFilter = activeTab,
    nextDevice: string = deviceFilter
  ) {
    setIsLoading(true);
    setError("");
    try {
      const fetched = await listUploadSessions({
        status: nextTab,
        deviceId: nextDevice === "all" ? null : nextDevice
      });
      setSessions(fetched);
      setKnownDevices((current) => mergeDevices(current, deriveDevices(fetched)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load uploads");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (initialSessions === undefined) {
      void loadSessions(activeTab, deviceFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, deviceFilter]);

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

  async function resumeSession(session: UploadSession, file: File | undefined) {
    setMessage("");
    setError("");

    if (!file || !matchesSessionFile(session, file)) {
      setError(`Select the same file to resume ${session.filename}`);
      return;
    }

    setBusySessionId(session.id);

    try {
      const uploaded = await resumeUploadSession({
        sessionId: session.id,
        file,
        receivedBytes: session.receivedBytes,
        sizeBytes: session.sizeBytes,
        chunkSizeBytes: DEFAULT_CHUNK_SIZE_BYTES,
        onProgress: ({ loadedBytes, totalBytes }) =>
          setMessage(`Resuming ${session.filename} ${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`)
      });
      setSessions((currentSessions) => currentSessions.filter((candidate) => candidate.id !== session.id));
      onUploaded?.([uploaded]);
      setMessage(`Resumed ${session.filename}`);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Could not resume upload");
    } finally {
      setBusySessionId(null);
    }
  }

  async function copyError(session: UploadSession) {
    if (!session.error || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(session.error);
      setMessage(`Copied ${session.filename} error to clipboard`);
    } catch {
      // clipboard permissions can fail silently in some browsers
    }
  }

  const deviceOptions = useMemo(() => {
    return knownDevices.length > 0 ? knownDevices : deriveDevices(sessions);
  }, [knownDevices, sessions]);

  const emptyText = emptyStateForTab(activeTab);

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

      <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Upload session filter">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition",
                isActive
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-surface text-ink hover:border-muted"
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
        {deviceOptions.length > 1 ? (
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted">
            <span>Device</span>
            <select
              value={deviceFilter}
              onChange={(event) => setDeviceFilter(event.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-xs font-semibold text-ink"
            >
              <option value="all">All devices</option>
              {deviceOptions.map((device) => (
                <option key={device} value={device}>
                  {device}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
            <p className="mt-3 text-sm font-semibold text-ink">{emptyText.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{emptyText.description}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label={`${activeTab} uploads`}>
            {sessions.map((session) => (
              <li key={session.id} className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{session.filename}</p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {formatBytes(session.receivedBytes)} / {formatBytes(session.sizeBytes)}
                    </span>
                    <span className="truncate">{session.sourceDevice}</span>
                    <span className="truncate" title={new Date(session.updatedAt).toLocaleString()}>
                      {formatRelative(session.updatedAt)}
                    </span>
                  </div>
                  {session.error ? (
                    <p className="mt-2 break-words rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                      {session.error}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {session.error ? (
                    <button
                      type="button"
                      onClick={() => void copyError(session)}
                      aria-label={`Copy error for ${session.filename}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
                    >
                      <ClipboardCopy aria-hidden="true" className="h-3.5 w-3.5" />
                      Copy error
                    </button>
                  ) : null}
                  {activeTab === "open" ? (
                    <>
                      <input
                        id={`resume-upload-${session.id}`}
                        aria-label={`Select file to resume ${session.filename}`}
                        className="sr-only"
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void resumeSession(session, file);
                        }}
                      />
                      <label
                        htmlFor={`resume-upload-${session.id}`}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.currentTarget.control?.click();
                          }
                        }}
                        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <UploadCloud aria-hidden="true" className="h-3.5 w-3.5" />
                        Resume
                      </label>
                      <button
                        type="button"
                        onClick={() => void abortSession(session)}
                        disabled={busySessionId === session.id}
                        aria-label={`Abort ${session.filename}`}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
                        Abort
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function deriveDevices(sessions: UploadSession[]): string[] {
  const set = new Set<string>();
  for (const session of sessions) {
    if (session.sourceDevice) {
      set.add(session.sourceDevice);
    }
  }
  return Array.from(set).sort();
}

function mergeDevices(existing: string[], incoming: string[]): string[] {
  const set = new Set<string>([...existing, ...incoming]);
  return Array.from(set).sort();
}

function matchesSessionFile(session: UploadSession, file: File): boolean {
  return file.name === session.filename && file.size === session.sizeBytes;
}

function emptyStateForTab(tab: UploadSessionStatusFilter): { title: string; description: string } {
  if (tab === "failed") {
    return {
      title: "No failed uploads",
      description: "Sessions that errored mid-transfer would appear here. The temp files are auto-cleaned 24 hours after failure."
    };
  }
  if (tab === "aborted") {
    return {
      title: "No aborted uploads",
      description: "Sessions you abort, or that the chunk-cleanup job tidies after they've been stale for 24 hours, appear here."
    };
  }
  return {
    title: "No open uploads",
    description: "Interrupted large transfers will appear here while they can be cleaned up."
  };
}

function formatRelative(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  const deltaSeconds = (Date.now() - parsed) / 1000;
  if (deltaSeconds < 60) return "just now";
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}
