import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

type UploadCleanupSession = {
  id: string;
  tempPath: string;
};

type UploadCleanupRepo = {
  listStaleUploadSessions: (olderThanIso: string) => UploadCleanupSession[];
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
};

export async function cleanupStaleUploads({
  repo = createMetadataRepository(getDatabase()),
  storage = createStorageService(),
  olderThan
}: CleanupStaleUploadsInput): Promise<UploadCleanupResult> {
  const sessions = repo.listStaleUploadSessions(olderThan.toISOString());
  const result: UploadCleanupResult = {
    scanned: sessions.length,
    cleaned: 0,
    failed: 0
  };

  for (const session of sessions) {
    try {
      await storage.abortUploadSession(session.tempPath);
      repo.failUploadSession(session.id, "stale upload cleaned up");
      result.cleaned += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
