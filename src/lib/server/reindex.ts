import type { AppDatabase } from "@/lib/server/db";
import { scanStorageRoot, type ScanStorageRootResult } from "@/lib/server/indexer";

export type ReindexInput = {
  db: AppDatabase;
  storageRoot: string;
};

let inFlight: Promise<ScanStorageRootResult> | null = null;

/**
 * Single-flight wrapper around scanStorageRoot.
 *
 * A reindex walks the whole storage tree and checksums every new file. Two
 * overlapping runs would duplicate that work and race each other's inserts, so
 * a caller arriving while a scan is running joins that scan instead of starting
 * a second one. Single-process app, so a module-level promise is enough.
 */
export async function reindexStorageRoot(input: ReindexInput): Promise<ScanStorageRootResult> {
  if (inFlight) {
    return inFlight;
  }

  inFlight = scanStorageRoot(input).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Test seam: true while a scan is running. */
export function isReindexRunning(): boolean {
  return inFlight !== null;
}
