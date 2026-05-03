import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import type { FilePreview, PreviewJob } from "@/lib/shared/types";

type PreviewRepo = {
  listPendingPreviewJobs?: (limit?: number) => PreviewJob[];
  upsertFilePreview: (input: {
    fileId: string;
    kind: FilePreview["kind"];
    status: FilePreview["status"];
    previewPath?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    error?: string | null;
  }) => FilePreview | unknown;
};

type PreviewStorage = {
  absolutePathFor: (relativePath: string) => string;
};

type ProcessPreviewJobInput = {
  job: PreviewJob;
  repo: PreviewRepo;
  storage: PreviewStorage;
};

type RunPreviewWorkerInput = {
  repo?: PreviewRepo;
  storage?: PreviewStorage;
  limit?: number;
};

export type PreviewWorkerResult = {
  scanned: number;
  processed: number;
  failed: number;
};

export async function processPreviewJob({ job, repo, storage }: ProcessPreviewJobInput): Promise<void> {
  if (job.file.family !== "image") {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "skipped",
      error: `preview generation is not supported for ${job.file.family} files`
    });
    return;
  }

  const absolutePath = storage.absolutePathFor(job.file.storagePath);
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error("storage path is not a file");
    }
  } catch (error) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "failed",
      error: error instanceof Error ? error.message : "source file missing"
    });
    return;
  }

  await generateImageThumbnail({ job, repo, storage, absolutePath });
}

async function generateImageThumbnail({
  job,
  repo,
  storage,
  absolutePath
}: ProcessPreviewJobInput & { absolutePath: string }) {
  const previewPath = path.posix.join(".previews", "images", `${job.file.id}.webp`);
  const absolutePreviewPath = storage.absolutePathFor(previewPath);
  await fs.mkdir(path.dirname(absolutePreviewPath), { recursive: true });

  try {
    const info = await sharp(absolutePath)
      .rotate()
      .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(absolutePreviewPath);

    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "ready",
      previewPath,
      width: info.width,
      height: info.height,
      error: null
    });
  } catch (error) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "failed",
      error: error instanceof Error ? error.message : "image thumbnail generation failed"
    });
  }
}

export async function runPreviewWorker({
  repo = createMetadataRepository(getDatabase()),
  storage = createStorageService(),
  limit = 25
}: RunPreviewWorkerInput = {}): Promise<PreviewWorkerResult> {
  if (!repo.listPendingPreviewJobs) {
    return { scanned: 0, processed: 0, failed: 0 };
  }

  const jobs = repo.listPendingPreviewJobs(limit);
  const result: PreviewWorkerResult = {
    scanned: jobs.length,
    processed: 0,
    failed: 0
  };

  for (const job of jobs) {
    try {
      await processPreviewJob({ job, repo, storage });
      result.processed += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
