import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewJob } from "@/lib/shared/types";

const mocks = vi.hoisted(() => ({
  probeFfmpeg: vi.fn(),
  generateVideoPoster: vi.fn()
}));

vi.mock("@/lib/server/previews/ffmpeg", () => ({ probeFfmpeg: mocks.probeFfmpeg }));
vi.mock("@/lib/server/previews/video", () => ({ generateVideoPoster: mocks.generateVideoPoster }));

const videoJob: PreviewJob = {
  file: {
    id: "file_video_1",
    name: "clip.mp4",
    extension: "mp4",
    family: "video",
    mimeType: "video/mp4",
    sizeBytes: 4096,
    checksum: "vid",
    storagePath: "Inbox/Browser/clip.mp4",
    projectId: null,
    categoryId: null,
    sourceDevice: "Browser",
    status: "active",
    archivedAt: null,
    uploadedAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    tags: []
  },
  preview: {
    fileId: "file_video_1",
    kind: "video",
    status: "pending",
    previewPath: null,
    width: null,
    height: null,
    durationSeconds: null,
    error: null,
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z"
  }
};

describe("preview worker — video", () => {
  let workDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-video-"));
    fs.mkdirSync(path.join(workDir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "Inbox", "Browser", "clip.mp4"), Buffer.from("fake video bytes"));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("records status: 'unsupported' when ffmpeg is not available", async () => {
    mocks.probeFfmpeg.mockResolvedValue({ available: false, error: "ffmpeg not installed" });
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: videoJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_video_1",
        kind: "video",
        status: "unsupported",
        error: "ffmpeg not installed"
      })
    );
    expect(mocks.generateVideoPoster).not.toHaveBeenCalled();
  });

  it("generates a poster and writes ready metadata when ffmpeg is available", async () => {
    mocks.probeFfmpeg.mockResolvedValue({ available: true, version: "6.0" });
    mocks.generateVideoPoster.mockImplementation(async ({ outputJpegPath }: { outputJpegPath: string }) => {
      fs.writeFileSync(
        outputJpegPath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
          "base64"
        )
      );
      return { durationSeconds: 12.5, posterTimestampSeconds: 1.25 };
    });
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: videoJob, repo, storage });

    expect(mocks.generateVideoPoster).toHaveBeenCalledTimes(1);
    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_video_1",
        kind: "video",
        status: "ready",
        durationSeconds: 12.5,
        previewPath: expect.stringMatching(/^\.previews\/images\/file_video_1\.webp$/)
      })
    );
    expect(fs.existsSync(path.join(workDir, ".previews", "images", "file_video_1.webp"))).toBe(true);
  });

  it("records status: 'failed' with a clear message when poster extraction throws", async () => {
    mocks.probeFfmpeg.mockResolvedValue({ available: true });
    mocks.generateVideoPoster.mockRejectedValue(new Error("ffmpeg exited with code 1"));
    const { processPreviewJob } = await import("@/lib/server/previews/worker");

    const repo = { upsertFilePreview: vi.fn() };
    const storage = { absolutePathFor: (p: string) => path.join(workDir, p) };

    await processPreviewJob({ job: videoJob, repo, storage });

    expect(repo.upsertFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_video_1",
        kind: "video",
        status: "failed",
        error: "ffmpeg exited with code 1"
      })
    );
  });
});
