import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import sharp, { type OutputInfo, type Sharp } from "sharp";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";
import type { FilePreview, PreviewJob } from "@/lib/shared/types";
import { probeFfmpeg } from "./ffmpeg";
import { readEmbeddedThumbnail } from "./embeddedThumbnail";
import { readGcodeThumbnail } from "./gcodeThumbnail";
import { renderPdfFirstPage } from "./pdf";
import { probePoppler } from "./poppler";
import { renderStlThumbnail } from "./stlThumbnail";
import { generateVideoPoster } from "./video";

// One libvips thread keeps peak memory predictable under the container's memory limit.
sharp.concurrency(1);

// CAD formats with a preview source, by extension: the image a slicer saved inside the file, or for STL a drawing of
// the mesh. A reader returns the image to shrink into a preview, or why there isn't one.
type ThumbnailReader = (absolutePath: string) => Promise<Buffer | { skipped: string } | null>;

const embeddedThumbnailReaders = new Map<string, ThumbnailReader>([
  ["3mf", readEmbeddedThumbnail],
  ["gcode", readGcodeThumbnail],
  ["stl", renderStlThumbnail]
]);

type PreviewRepo = {
  listPendingPreviewJobs?: (limit?: number) => PreviewJob[];
  claimPreviewJob?: (fileId: string, kind: FilePreview["kind"]) => boolean;
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
  resolveReadPath?: (relativePath: string) => Promise<string>;
  containedPath?: (relativePath: string) => Promise<string>;
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
  const isPdf = job.file.family === "document" && job.file.extension.toLowerCase() === "pdf";
  const readThumbnail = job.file.family === "cad" ? embeddedThumbnailReaders.get(job.file.extension.toLowerCase()) : undefined;
  const isSupported = job.file.family === "image" || job.file.family === "video" || isPdf || Boolean(readThumbnail);

  if (!isSupported) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "skipped",
      error: skippedReason(job.file.family)
    });
    return;
  }

  let absolutePath: string;
  try {
    absolutePath = storage.resolveReadPath
      ? await storage.resolveReadPath(job.file.storagePath)
      : storage.absolutePathFor(job.file.storagePath);
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

  // .previews is in the files dataset too; refuse to write thumbnails through a symlinked folder there.
  try {
    await storage.containedPath?.(path.posix.join(".previews", "images", `${job.file.id}.webp`));
  } catch (error) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "failed",
      error: error instanceof Error ? error.message : "preview folder is not usable"
    });
    return;
  }

  if (job.file.family === "image") {
    await generateImageThumbnail({ job, repo, storage, absolutePath });
    return;
  }

  if (job.file.family === "video") {
    await generateVideoPosterFrame({ job, repo, storage, absolutePath });
    return;
  }

  if (readThumbnail) {
    await generateEmbeddedThumbnail({ job, repo, storage, absolutePath, readThumbnail });
    return;
  }

  await generatePdfFirstPage({ job, repo, storage, absolutePath });
}

// .previews lives in the files dataset and preview names are predictable, so a symlink planted at one must be
// replaced, not written through: write a fresh file, then rename it over the final path.
async function writePreview(image: Sharp, absolutePreviewPath: string): Promise<OutputInfo> {
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const staged = `${absolutePreviewPath}.${nanoid(8)}.tmp`;
  await fs.writeFile(staged, data, { flag: "wx" });
  try {
    await fs.rename(staged, absolutePreviewPath);
  } catch (error) {
    await fs.unlink(staged).catch(() => undefined);
    throw error;
  }
  return info;
}

function skippedReason(family: PreviewJob["file"]["family"]): string {
  if (family === "document") {
    return "preview generation is only supported for PDF documents in v0.3";
  }
  return `preview generation is not supported for ${family} files`;
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
    const info = await writePreview(
      sharp(absolutePath)
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }),
      absolutePreviewPath
    );

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
    const message = error instanceof Error ? error.message : "image thumbnail generation failed";
    // The bundled libvips has no HEVC decoder, so iPhone HEIC photos can't be previewed. That is expected, not a
    // failure, and the raw error carries an absolute path.
    const unsupported = message.includes("compression format has not been built in");
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: unsupported ? "unsupported" : "failed",
      error: unsupported ? `${job.file.extension.toUpperCase()} images need a decoder the preview tools don't include` : message
    });
  }
}

async function generateVideoPosterFrame({
  job,
  repo,
  storage,
  absolutePath
}: ProcessPreviewJobInput & { absolutePath: string }) {
  const probe = await probeFfmpeg();
  if (!probe.available) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "unsupported",
      error: probe.error ?? "ffmpeg binary not available"
    });
    return;
  }

  const previewPath = path.posix.join(".previews", "images", `${job.file.id}.webp`);
  const absolutePreviewPath = storage.absolutePathFor(previewPath);
  const tempFramePath = path.join(os.tmpdir(), `nas-cloud-poster-${job.file.id}-${nanoid(6)}.jpg`);

  await fs.mkdir(path.dirname(absolutePreviewPath), { recursive: true });

  try {
    const poster = await generateVideoPoster({
      absolutePath,
      outputJpegPath: tempFramePath
    });

    const info = await writePreview(
      sharp(tempFramePath)
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }),
      absolutePreviewPath
    );

    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "ready",
      previewPath,
      width: info.width,
      height: info.height,
      durationSeconds: poster.durationSeconds,
      error: null
    });
  } catch (error) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "failed",
      error: error instanceof Error ? error.message : "video poster generation failed"
    });
  } finally {
    await fs.unlink(tempFramePath).catch(() => undefined);
  }
}

async function generateEmbeddedThumbnail({
  job,
  repo,
  storage,
  absolutePath,
  readThumbnail
}: ProcessPreviewJobInput & { absolutePath: string; readThumbnail: ThumbnailReader }) {
  const previewPath = path.posix.join(".previews", "images", `${job.file.id}.webp`);
  const absolutePreviewPath = storage.absolutePathFor(previewPath);
  await fs.mkdir(path.dirname(absolutePreviewPath), { recursive: true });

  try {
    const thumbnail = await readThumbnail(absolutePath);
    if (!Buffer.isBuffer(thumbnail)) {
      const error = thumbnail?.skipped ?? "no embedded thumbnail";
      repo.upsertFilePreview({ fileId: job.file.id, kind: job.preview.kind, status: "skipped", error });
      return;
    }

    const info = await writePreview(
      sharp(thumbnail)
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }),
      absolutePreviewPath
    );

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
      error: `could not make a preview from this ${job.file.extension.toUpperCase()}: ${error instanceof Error ? error.message : "unknown error"}`
    });
  }
}

async function generatePdfFirstPage({
  job,
  repo,
  storage,
  absolutePath
}: ProcessPreviewJobInput & { absolutePath: string }) {
  const probe = await probePoppler();
  if (!probe.available) {
    repo.upsertFilePreview({
      fileId: job.file.id,
      kind: job.preview.kind,
      status: "unsupported",
      error: probe.error ?? "pdftoppm (poppler-utils) not available"
    });
    return;
  }

  const previewPath = path.posix.join(".previews", "images", `${job.file.id}.webp`);
  const absolutePreviewPath = storage.absolutePathFor(previewPath);
  const tempPagePath = path.join(os.tmpdir(), `nas-cloud-pdf-${job.file.id}-${nanoid(6)}.png`);

  await fs.mkdir(path.dirname(absolutePreviewPath), { recursive: true });

  try {
    await renderPdfFirstPage({
      absolutePath,
      outputPngPath: tempPagePath
    });

    const info = await writePreview(
      sharp(tempPagePath)
        .rotate()
        .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 }),
      absolutePreviewPath
    );

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
      error: error instanceof Error ? error.message : "pdf preview generation failed"
    });
  } finally {
    await fs.unlink(tempPagePath).catch(() => undefined);
  }
}

let inFlight: Promise<PreviewWorkerResult> | null = null;

// The scheduler and the maintenance endpoint share this run, so only one batch decodes images at a time.
export function runPreviewWorker(input: RunPreviewWorkerInput = {}): Promise<PreviewWorkerResult> {
  inFlight ??= runBatch(input).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runBatch({
  repo = createMetadataRepository(getDatabase()),
  storage = createStorageService(),
  limit = 25
}: RunPreviewWorkerInput): Promise<PreviewWorkerResult> {
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
    // Claimed before any decoding so a job that kills the process is counted, not retried forever.
    if (repo.claimPreviewJob && !repo.claimPreviewJob(job.file.id, job.preview.kind)) {
      continue;
    }
    try {
      await processPreviewJob({ job, repo, storage });
      result.processed += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
