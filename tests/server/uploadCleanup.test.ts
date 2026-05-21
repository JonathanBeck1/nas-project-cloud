import { describe, expect, it, vi } from "vitest";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

describe("cleanupStaleUploads", () => {
  it("aborts stale open sessions and removes temp files", async () => {
    const repo = {
      listStaleUploadSessions: vi.fn(() => [{ id: "upload_1", tempPath: ".uploads/upload_1.part" }]),
      listOrphanedFailedUploadSessions: vi.fn(() => []),
      clearUploadSessionTempPath: vi.fn(),
      failUploadSession: vi.fn()
    };
    const storage = {
      abortUploadSession: vi.fn(async () => undefined)
    };

    const result = await cleanupStaleUploads({
      repo,
      storage,
      olderThan: new Date("2026-05-02T00:00:00.000Z")
    });

    expect(result).toEqual({ scanned: 1, cleaned: 1, failed: 0, orphanedTempCleaned: 0 });
    expect(storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_1.part");
    expect(repo.failUploadSession).toHaveBeenCalledWith("upload_1", "stale upload cleaned up");
    expect(repo.clearUploadSessionTempPath).not.toHaveBeenCalled();
  });

  it("removes orphaned chunks from failed sessions and clears the temp path", async () => {
    const repo = {
      listStaleUploadSessions: vi.fn(() => []),
      listOrphanedFailedUploadSessions: vi.fn(() => [
        { id: "upload_2", tempPath: ".uploads/upload_2.part" }
      ]),
      clearUploadSessionTempPath: vi.fn(),
      failUploadSession: vi.fn()
    };
    const storage = {
      abortUploadSession: vi.fn(async () => undefined)
    };

    const result = await cleanupStaleUploads({
      repo,
      storage,
      olderThan: new Date("2026-05-02T00:00:00.000Z")
    });

    expect(result).toEqual({ scanned: 1, cleaned: 0, failed: 0, orphanedTempCleaned: 1 });
    expect(storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_2.part");
    expect(repo.clearUploadSessionTempPath).toHaveBeenCalledWith("upload_2");
    expect(repo.failUploadSession).not.toHaveBeenCalled();
  });

  it("counts storage failures without crashing the loop", async () => {
    const repo = {
      listStaleUploadSessions: vi.fn(() => [{ id: "upload_3", tempPath: ".uploads/upload_3.part" }]),
      listOrphanedFailedUploadSessions: vi.fn(() => [
        { id: "upload_4", tempPath: ".uploads/upload_4.part" }
      ]),
      clearUploadSessionTempPath: vi.fn(),
      failUploadSession: vi.fn()
    };
    const storage = {
      abortUploadSession: vi.fn(async () => {
        throw new Error("disk gone");
      })
    };

    const result = await cleanupStaleUploads({
      repo,
      storage,
      olderThan: new Date("2026-05-02T00:00:00.000Z")
    });

    expect(result).toEqual({ scanned: 2, cleaned: 0, failed: 2, orphanedTempCleaned: 0 });
    expect(repo.failUploadSession).not.toHaveBeenCalled();
    expect(repo.clearUploadSessionTempPath).not.toHaveBeenCalled();
  });
});
