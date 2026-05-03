import { describe, expect, it, vi } from "vitest";
import { processPreviewJob } from "@/lib/server/previews/worker";
import type { PreviewJob } from "@/lib/shared/types";

const imageJob: PreviewJob = {
  file: {
    id: "file_1",
    name: "missing.png",
    extension: "png",
    family: "image",
    mimeType: "image/png",
    sizeBytes: 10,
    checksum: "abc",
    storagePath: "Inbox/Browser/missing.png",
    projectId: null,
    categoryId: null,
    sourceDevice: "Browser",
    status: "active",
    archivedAt: null,
    uploadedAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    tags: []
  },
  preview: {
    fileId: "file_1",
    kind: "image",
    status: "pending",
    previewPath: null,
    width: null,
    height: null,
    durationSeconds: null,
    error: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z"
  }
};

describe("preview worker", () => {
  it("marks a missing image file as failed", async () => {
    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: vi.fn(() => "/missing/render.png") };

    await processPreviewJob({ job: imageJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_1",
        kind: "image",
        status: "failed",
        error: expect.stringContaining("missing")
      })
    );
  });

  it("marks unsupported file families as skipped", async () => {
    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: vi.fn(() => "/storage/bracket.stl") };
    const job: PreviewJob = {
      ...imageJob,
      file: { ...imageJob.file, id: "file_cad", family: "cad", name: "bracket.stl", storagePath: "Inbox/Browser/bracket.stl" },
      preview: { ...imageJob.preview, fileId: "file_cad" }
    };

    await processPreviewJob({ job, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_cad",
        kind: "image",
        status: "skipped",
        error: "preview generation is not supported for cad files"
      })
    );
  });
});
