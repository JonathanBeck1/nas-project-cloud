import { appConfig } from "./config";
import { getDatabase } from "./db";
import { reconcileStorage } from "./indexer";

const INTERVAL_MS = 15 * 60_000;

export type ReconcileSchedulerHandle = {
  stop: () => void;
};

let activeHandle: ReconcileSchedulerHandle | null = null;

export function startReconcileScheduler(run: () => Promise<unknown> = runReconcile): ReconcileSchedulerHandle {
  if (activeHandle) {
    return activeHandle;
  }

  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;

  // Scheduled only after a run settles, so a long hashing pass cannot overlap itself.
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await run();
      } catch (error) {
        console.error("[reconcile-scheduler] run failed", error);
      }
      if (!stopped) {
        schedule();
      }
    }, INTERVAL_MS);
  };
  schedule();

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

function runReconcile() {
  return reconcileStorage({ db: getDatabase(), storageRoot: appConfig.storageRoot });
}
