import { runPreviewWorker, type PreviewWorkerResult } from "./worker";

const ACTIVE_INTERVAL_MS = 60_000;
const IDLE_INTERVAL_MS = 5 * 60_000;
const FULL_BATCH_DELAY_MS = 1_000;
const HOURLY_MAINTENANCE_INTERVAL_MS = 60 * 60_000;
const BATCH_LIMIT = 25;

type RunPreviewWorkerFn = (input?: { limit?: number }) => Promise<PreviewWorkerResult>;

type SchedulerInternals = {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  runWorker: RunPreviewWorkerFn;
  runHourlyMaintenance?: () => Promise<unknown>;
  onError?: (error: unknown) => void;
};

export type PreviewSchedulerHandle = {
  stop: () => Promise<void>;
  triggerNow: () => Promise<PreviewWorkerResult | null>;
};

let activeHandle: PreviewSchedulerHandle | null = null;

/**
 * Boot the in-process preview scheduler. Subsequent calls return the
 * existing handle so importing instrumentation more than once (HMR,
 * tests) does not stack timers.
 *
 * The loop is single-flight: a tick that's already running blocks the
 * next tick from overlapping. When a tick finds zero pending jobs it
 * sleeps for IDLE_INTERVAL_MS, after a full batch FULL_BATCH_DELAY_MS,
 * otherwise ACTIVE_INTERVAL_MS. Hourly maintenance (stale uploads, expired
 * auth state) rides along on the same loop.
 */
export function startPreviewScheduler(
  internals: Partial<SchedulerInternals> = {}
): PreviewSchedulerHandle {
  if (activeHandle) {
    return activeHandle;
  }

  const setTimeoutFn = internals.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = internals.clearTimeout ?? globalThis.clearTimeout;
  const runWorker: RunPreviewWorkerFn = internals.runWorker ?? runPreviewWorker;
  const onError = internals.onError ?? defaultOnError;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let inFlight: Promise<PreviewWorkerResult | null> | null = null;
  let lastMaintenanceAt: number | null = null;

  const tick = async (): Promise<PreviewWorkerResult | null> => {
    if (stopped) return null;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const maintenanceDue =
        lastMaintenanceAt === null || Date.now() - lastMaintenanceAt >= HOURLY_MAINTENANCE_INTERVAL_MS;
      if (internals.runHourlyMaintenance && maintenanceDue) {
        lastMaintenanceAt = Date.now();
        await internals.runHourlyMaintenance().catch(onError);
      }
      try {
        return await runWorker({ limit: BATCH_LIMIT });
      } catch (error) {
        onError(error);
        return null;
      }
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeoutFn(async () => {
      const result = await tick();
      schedule(delayAfter(result));
    }, delayMs);
  };

  schedule(ACTIVE_INTERVAL_MS);

  const handle: PreviewSchedulerHandle = {
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeoutFn(timer);
        timer = null;
      }
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // already reported via onError
        }
      }
      if (activeHandle === handle) {
        activeHandle = null;
      }
    },
    async triggerNow() {
      return tick();
    }
  };

  activeHandle = handle;
  return handle;
}

function delayAfter(result: PreviewWorkerResult | null): number {
  if (!result || result.scanned === 0) {
    return IDLE_INTERVAL_MS;
  }
  return result.scanned >= BATCH_LIMIT ? FULL_BATCH_DELAY_MS : ACTIVE_INTERVAL_MS;
}

/** For tests: drop the singleton so a fresh scheduler can boot. */
export function resetPreviewSchedulerForTesting(): void {
  activeHandle = null;
}

function defaultOnError(error: unknown): void {
  console.error("[preview-scheduler] tick failed", error);
}
