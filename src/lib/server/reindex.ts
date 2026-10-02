import type { AppDatabase } from "@/lib/server/db";
import { reconcileStorage, type ReconcileStorageResult } from "@/lib/server/indexer";

export type ReindexInput = {
  db: AppDatabase;
  storageRoot: string;
  budgetMs?: number;
};

let inFlight: Promise<ReconcileStorageResult> | null = null;

/**
 * Single-flight wrapper around reconcileStorage, shared by the maintenance
 * route and the background scheduler. Two overlapping runs would hash the same
 * new files and race each other's updates, so a caller arriving mid-run joins
 * that run instead. Single-process app, so a module-level promise is enough.
 */
export function reindexStorageRoot(input: ReindexInput): Promise<ReconcileStorageResult> {
  if (!inFlight) {
    inFlight = reconcileStorage(input).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
