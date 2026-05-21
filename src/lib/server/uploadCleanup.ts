import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

type UploadCleanupSession = {
  id: string;
  tempPath: string | null;
};

type UploadCleanupRepo = {
  listStaleUploadSessions: (olderThanIso: string) => UploadCleanupSession[];
  listOrphanedFailedUploadSessions?: (olderThanIso: string) => UploadCleanupSession[];
  clearUploadSessionTempPath?: (id: string) => unknown;
  failUploadSession: (id: string, error: string) => unknown;
};

type UploadCleanupStorage = {
  abortUploadSession: (tempRelativePath: string) => Promise<unknown>;
};

type CleanupStaleUploadsInput = {
  repo?: UploadCleanupRepo;
  storage?: UploadCleanupStorage;
  olderThan: Date;
};

export type UploadCleanupResult = {
  scanned: number;
  cleaned: number;
  failed: number;
  orphanedTempCleaned: number;
};

export async function cleanupStaleUploads({
  repo = createMetadataRepository(getDatabase()),
  storage = createStorageService(),
  olderThan
}: CleanupStaleUploadsInput): Promise<UploadCleanupResult> {
  const olderThanIso = olderThan.toISOString();
  const stale = repo.listStaleUploadSessions(olderThanIso);
  const orphaned = repo.listOrphanedFailedUploadSessions
    ? repo.listOrphanedFailedUploadSessions(olderThanIso)
    : [];

  const result: UploadCleanupResult = {
    scanned: stale.length + orphaned.length,
    cleaned: 0,
    failed: 0,
    orphanedTempCleaned: 0
  };

  for (const session of stale) {
    if (!session.tempPath) continue;
    try {
      await storage.abortUploadSession(session.tempPath);
      repo.failUploadSession(session.id, "stale upload cleaned up");
      result.cleaned += 1;
    } catch {
      result.failed += 1;
    }
  }

  for (const session of orphaned) {
    if (!session.tempPath) continue;
    try {
      await storage.abortUploadSession(session.tempPath);
      repo.clearUploadSessionTempPath?.(session.id);
      result.orphanedTempCleaned += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
