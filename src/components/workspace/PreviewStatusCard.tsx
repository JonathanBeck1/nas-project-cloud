"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, RotateCw } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { FilePreviewStatus } from "@/lib/shared/types";

const POLL_INTERVAL_MS = 5_000;

type Counts = Record<FilePreviewStatus, number>;

type FfmpegStatus = { available: boolean; version: string | null };

type StatusResponse = {
  counts: Counts;
  lastReadyAt: string | null;
  ffmpeg?: FfmpegStatus;
};

const ZERO_COUNTS: Counts = { pending: 0, ready: 0, failed: 0, skipped: 0, unsupported: 0 };

export function PreviewStatusCard() {
  const [counts, setCounts] = useState<Counts>(ZERO_COUNTS);
  const [lastReadyAt, setLastReadyAt] = useState<string | null>(null);
  const [ffmpeg, setFfmpeg] = useState<FfmpegStatus | null>(null);
  const [error, setError] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessMessage, setReprocessMessage] = useState("");
  const isMountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/maintenance/previews/status", {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const json = (await response.json()) as StatusResponse;
      if (!isMountedRef.current) return;
      setCounts({ ...ZERO_COUNTS, ...json.counts });
      setLastReadyAt(json.lastReadyAt);
      setFfmpeg(json.ffmpeg ?? null);
      setError("");
    } catch (loadError) {
      if (!isMountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Could not load preview status");
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchStatus();

    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        void fetchStatus();
      }, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchStatus();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") {
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMountedRef.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchStatus]);

  async function reprocessFailed() {
    if (counts.failed === 0 || isReprocessing) return;
    setIsReprocessing(true);
    setReprocessMessage("");
    try {
      const response = await fetch("/api/maintenance/previews", {
        method: "POST",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ retryFailed: true, limit: 100 })
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }
      const json = (await response.json()) as {
        result: { scanned: number; processed: number; failed: number };
        resetCount: number;
      };
      setReprocessMessage(
        `Requeued ${json.resetCount}, processed ${json.result.processed}, ${json.result.failed} still failed`
      );
      await fetchStatus();
    } catch (retryError) {
      setReprocessMessage(
        retryError instanceof Error ? `Retry failed: ${retryError.message}` : "Retry failed"
      );
    } finally {
      setIsReprocessing(false);
    }
  }

  const total = counts.pending + counts.ready + counts.failed + counts.skipped + counts.unsupported;

  return (
    <section
      className="rounded-md border border-line bg-panel p-4 shadow-panel"
      aria-labelledby="preview-status-heading"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <ImageIcon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="preview-status-heading" className="text-sm font-semibold text-ink">
            Preview pipeline
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Background generation status for image, video, and document previews. Refreshes every five seconds while
            this tab is visible.
          </p>
        </div>
        {ffmpeg ? (
          <span
            className={
              ffmpeg.available
                ? "shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                : "shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
            }
            title={ffmpeg.available && ffmpeg.version ? `ffmpeg ${ffmpeg.version}` : undefined}
          >
            {ffmpeg.available ? "ffmpeg ready" : "ffmpeg unavailable"}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Counter label="Ready" value={counts.ready} tone="ready" />
        <Counter label="Pending" value={counts.pending} tone="pending" />
        <Counter label="Failed" value={counts.failed} tone="failed" />
        <Counter label="Skipped" value={counts.skipped} tone="muted" />
        <Counter label="Unsupported" value={counts.unsupported} tone="muted" />
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Last successful preview:{" "}
          <span className="font-medium text-ink">
            {lastReadyAt ? new Date(lastReadyAt).toLocaleString() : "never"}
          </span>
          {total === 0 ? <span className="ml-2">(no preview rows yet)</span> : null}
        </span>
        <button
          type="button"
          onClick={reprocessFailed}
          disabled={counts.failed === 0 || isReprocessing}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCw aria-hidden="true" className={`h-4 w-4 ${isReprocessing ? "animate-spin" : ""}`} />
          Reprocess failed
        </button>
      </div>

      {reprocessMessage ? (
        <p role="status" className="mt-3 text-xs font-medium text-accent">
          {reprocessMessage}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </section>
  );
}

type CounterTone = "ready" | "pending" | "failed" | "muted";

function Counter({ label, value, tone }: { label: string; value: number; tone: CounterTone }) {
  const accent =
    tone === "ready"
      ? "text-emerald-500"
      : tone === "pending"
      ? "text-accent"
      : tone === "failed"
      ? "text-red-500"
      : "text-muted";

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</dd>
    </div>
  );
}
