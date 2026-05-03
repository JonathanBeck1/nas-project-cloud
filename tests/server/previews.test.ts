import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { processPreviewJob } from "@/lib/server/previews/worker";
import { createStorageService } from "@/lib/server/storage";
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

  it("generates an image thumbnail and stores ready preview metadata", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-previews-"));
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const storage = createStorageService(dir);
      fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "Inbox", "Browser", "render.png"),
        Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64")
      );
      const file = repo.createFile({
        name: "render.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 68,
        checksum: "abc",
        storagePath: "Inbox/Browser/render.png",
        sourceDevice: "Browser"
      });
      const preview = repo.upsertFilePreview({
        fileId: file.id,
        kind: "image",
        status: "pending"
      });

      await processPreviewJob({ job: { file, preview }, repo, storage });

      const ready = repo.getFilePreview(file.id, "image");
      expect(ready).toMatchObject({
        fileId: file.id,
        kind: "image",
        status: "ready",
        width: 1,
        height: 1,
        error: null
      });
      expect(ready?.previewPath).toMatch(/^\.previews\/images\/file_.+\.webp$/);
      expect(fs.existsSync(path.join(dir, ready?.previewPath ?? ""))).toBe(true);
    } finally {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
