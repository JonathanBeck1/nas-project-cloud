import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "@/lib/server/config";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { checkHealth } from "@/lib/server/health";
import { createMetadataRepository } from "@/lib/server/metadata";
import { processPreviewJob } from "@/lib/server/previews/worker";
import { createStorageService } from "@/lib/server/storage";

let dir: string;
let root: string;
let outside: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-no-follow-"));
  root = path.join(dir, "storage");
  fs.mkdirSync(root);
  // Stands in for the app database or anything else the container can write.
  outside = path.join(dir, "nas-cloud.sqlite");
  fs.writeFileSync(outside, "PRECIOUS");
  db = createDatabase(path.join(dir, "test.sqlite"));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const untouched = () => expect(fs.readFileSync(outside, "utf8")).toBe("PRECIOUS");

describe("write paths ignore symlinks planted in the files dataset", () => {
  it("the health probe does not write through a symlink at the storage root", async () => {
    fs.symlinkSync(outside, path.join(root, ".nas-cloud-healthcheck"));

    const result = await checkHealth({
      config: { storageRoot: root, dbPath: path.join(dir, "test.sqlite") } as AppConfig,
      db,
      probes: {
        ffmpeg: async () => ({ available: true, version: "6.1" }),
        poppler: async () => ({ available: true, version: "24.0" })
      }
    });

    untouched();
    expect(result.checks.storage.ok).toBe(true);
    expect(fs.readdirSync(root)).toEqual([".nas-cloud-healthcheck"]);
  });

  it("a chunk is not written through a symlink that replaced the upload temp file", async () => {
    const storage = createStorageService(root);
    const temp = await storage.createUploadTempPath("upload_planted");
    fs.rmSync(temp.absolutePath);
    fs.symlinkSync(outside, temp.absolutePath);

    await expect(
      storage.appendUploadChunk({ tempRelativePath: temp.relativePath, offset: 0, bytes: Buffer.from("EVIL") })
    ).rejects.toThrow();

    untouched();
  });

  it("a preview is not written through a symlink planted at its predictable path", async () => {
    const repo = createMetadataRepository(db);
    fs.mkdirSync(path.join(root, "Inbox", "Mac"), { recursive: true });
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } })
      .png()
      .toFile(path.join(root, "Inbox", "Mac", "red.png"));
    const file = repo.createFile({
      name: "red.png",
      extension: "png",
      family: "image",
      mimeType: "image/png",
      sizeBytes: 1,
      checksum: "x",
      storagePath: "Inbox/Mac/red.png",
      sourceDevice: "Mac"
    });
    repo.upsertFilePreview({ fileId: file.id, kind: "image", status: "pending" });
    const previewFile = path.join(root, ".previews", "images", `${file.id}.webp`);
    fs.mkdirSync(path.dirname(previewFile), { recursive: true });
    fs.symlinkSync(outside, previewFile);
    const [job] = repo.listPendingPreviewJobs();

    await processPreviewJob({ job, repo, storage: createStorageService(root) });

    untouched();
    expect(repo.getFilePreview(file.id, "image")?.status).toBe("ready");
    expect(fs.lstatSync(previewFile).isFile()).toBe(true);
    expect(fs.readdirSync(path.dirname(previewFile))).toEqual([`${file.id}.webp`]);
  });
});
