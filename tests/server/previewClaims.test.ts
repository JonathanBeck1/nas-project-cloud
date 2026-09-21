import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { runPreviewWorker } from "@/lib/server/previews/worker";
import type { PreviewJob } from "@/lib/shared/types";

const createdDirs: string[] = [];
const createdDbs: AppDatabase[] = [];

afterEach(() => {
  for (const db of createdDbs.splice(0)) {
    db.close();
  }
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function repoWithPendingImage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-claims-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  createdDbs.push(db);
  const repo = createMetadataRepository(db);
  const file = repo.createFile({
    name: "render.png",
    extension: "png",
    family: "image",
    mimeType: "image/png",
    sizeBytes: 10,
    checksum: "abc",
    storagePath: "Inbox/Browser/render.png",
    sourceDevice: "Browser"
  });
  repo.upsertFilePreview({ fileId: file.id, kind: "image", status: "pending" });
  return { db, repo, file };
}

function previewRow(db: AppDatabase, fileId: string) {
  return db
    .prepare<[string], { status: string; attempts: number; error: string | null }>(
      "select status, attempts, error from file_previews where file_id = ?"
    )
    .get(fileId);
}

describe("preview job claims", () => {
  it("claims a pending job once and hides it from the pending list", () => {
    const { db, repo, file } = repoWithPendingImage();

    expect(repo.claimPreviewJob(file.id, "image")).toBe(true);
    expect(repo.claimPreviewJob(file.id, "image")).toBe(false);

    expect(previewRow(db, file.id)).toMatchObject({ status: "processing", attempts: 1 });
    expect(repo.listPendingPreviewJobs()).toEqual([]);
  });

  it("requeues a job left processing by a crash, then gives up after three attempts", () => {
    const { db, repo, file } = repoWithPendingImage();

    for (const attempt of [1, 2]) {
      expect(repo.claimPreviewJob(file.id, "image")).toBe(true);
      expect(repo.requeueStalePreviewJobs()).toEqual({ requeued: 1, failed: 0 });
      expect(previewRow(db, file.id)).toMatchObject({ status: "pending", attempts: attempt });
    }

    expect(repo.claimPreviewJob(file.id, "image")).toBe(true);
    expect(repo.requeueStalePreviewJobs()).toEqual({ requeued: 0, failed: 1 });
    expect(previewRow(db, file.id)).toMatchObject({ status: "failed", attempts: 3 });
    expect(previewRow(db, file.id)?.error).toContain("3 attempts");
    expect(repo.listPendingPreviewJobs()).toEqual([]);
  });

  it("gives a manually retried job a fresh set of attempts", () => {
    const { db, repo, file } = repoWithPendingImage();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      repo.claimPreviewJob(file.id, "image");
      repo.requeueStalePreviewJobs();
    }

    expect(repo.resetFailedPreviews()).toBe(1);

    expect(previewRow(db, file.id)).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("counts processing jobs", () => {
    const { repo, file } = repoWithPendingImage();
    repo.claimPreviewJob(file.id, "image");

    expect(repo.countFilePreviewsByStatus()).toMatchObject({ processing: 1, pending: 0 });
  });
});

describe("preview worker claims", () => {
  const job = (id: string): PreviewJob =>
    ({
      file: { id, family: "other", extension: "bin", storagePath: `Inbox/d/${id}.bin` },
      preview: { fileId: id, kind: "image", status: "pending" }
    }) as PreviewJob;

  it("skips a job another worker already claimed", async () => {
    const repo = {
      listPendingPreviewJobs: vi.fn(() => [job("file_a"), job("file_b")]),
      claimPreviewJob: vi.fn((fileId: string) => fileId === "file_b"),
      upsertFilePreview: vi.fn()
    };

    const result = await runPreviewWorker({ repo, storage: { absolutePathFor: vi.fn() } });

    expect(result).toEqual({ scanned: 2, processed: 1, failed: 0 });
    expect(repo.upsertFilePreview).toHaveBeenCalledTimes(1);
    expect(repo.upsertFilePreview).toHaveBeenCalledWith(expect.objectContaining({ fileId: "file_b" }));
  });

  it("shares one run between concurrent callers", async () => {
    const repo = {
      listPendingPreviewJobs: vi.fn(() => [job("file_a")]),
      claimPreviewJob: vi.fn(() => true),
      upsertFilePreview: vi.fn()
    };
    const storage = { absolutePathFor: vi.fn() };

    const [first, second] = await Promise.all([runPreviewWorker({ repo, storage }), runPreviewWorker({ repo, storage })]);

    expect(repo.listPendingPreviewJobs).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});
