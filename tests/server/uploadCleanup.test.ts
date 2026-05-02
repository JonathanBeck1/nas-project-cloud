import { describe, expect, it, vi } from "vitest";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

describe("cleanupStaleUploads", () => {
  it("aborts stale open sessions and removes temp files", async () => {
    const repo = {
      listStaleUploadSessions: vi.fn(() => [{ id: "upload_1", tempPath: ".uploads/upload_1.part" }]),
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

    expect(result).toEqual({ scanned: 1, cleaned: 1, failed: 0 });
    expect(storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_1.part");
    expect(repo.failUploadSession).toHaveBeenCalledWith("upload_1", "stale upload cleaned up");
  });
});
