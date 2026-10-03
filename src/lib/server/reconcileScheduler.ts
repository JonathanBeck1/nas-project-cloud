import { appConfig } from "./config";
import { getDatabase } from "./db";
import { reindexStorageRoot } from "./reindex";

const FIRST_RUN_MS = 60_000;
const INTERVAL_MS = 15 * 60_000;

export type ReconcileSchedulerHandle = {
  stop: () => void;
};

let activeHandle: ReconcileSchedulerHandle | null = null;

// Storage sync on its own timer, so a long first import never holds up previews.
export function startReconcileScheduler(run: () => Promise<unknown> = runSync): ReconcileSchedulerHandle {
  if (activeHandle) {
    return activeHandle;
  }

  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;

  // Scheduled only after a run settles, so a long hashing pass cannot overlap itself.
  const schedule = (delayMs: number) => {
    timer = setTimeout(async () => {
      try {
        await run();
      } catch (error) {
        console.error("[storage-sync] run failed", error);
      }
      if (!stopped) {
        schedule(INTERVAL_MS);
      }
    }, delayMs);
  };
  schedule(FIRST_RUN_MS);

  const handle: ReconcileSchedulerHandle = {
    stop() {
      stopped = true;
      clearTimeout(timer);
      if (activeHandle === handle) {
        activeHandle = null;
      }
    }
  };
  activeHandle = handle;
  return handle;
}

/** For tests: drop the singleton so a fresh scheduler can boot. */
export function resetReconcileSchedulerForTesting(): void {
  activeHandle = null;
}

function runSync() {
  return reindexStorageRoot({ db: getDatabase(), storageRoot: appConfig.storageRoot });
}
