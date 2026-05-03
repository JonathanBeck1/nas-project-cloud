import fs from "node:fs/promises";
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

  repo.upsertFilePreview({
    fileId: job.file.id,
    kind: job.preview.kind,
    status: "skipped",
    error: "image thumbnail generation is not configured"
  });
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
