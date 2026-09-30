import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { resetAppConfigForTesting } from "@/lib/server/config";
import { createMetadataRepository } from "@/lib/server/metadata";
import { sweepOrphanPreviews } from "@/lib/server/previews/cleanup";
import { createStorageService } from "@/lib/server/storage";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("@/lib/server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/db")>()),
  getDatabase: () => state.db
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, session: { userId: "user_1" } }))
}));

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

let dir: string;
let root: string;
let tmp: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-preview-cleanup-"));
  root = path.join(dir, "storage");
  tmp = path.join(dir, "tmp");
  fs.mkdirSync(path.join(root, ".previews", "images"), { recursive: true });
  fs.mkdirSync(path.join(root, "Archive"), { recursive: true });
  fs.mkdirSync(tmp);
  process.env.NAS_CLOUD_STORAGE_ROOT = root;
  resetAppConfigForTesting();
  db = createDatabase(path.join(dir, "test.sqlite"));
  state.db = db;
});

afterEach(() => {
  db.close();
  delete process.env.NAS_CLOUD_STORAGE_ROOT;
  resetAppConfigForTesting();
  fs.rmSync(dir, { recursive: true, force: true });
});

function archivedFileWithPreview(name = "private.jpg") {
  fs.writeFileSync(path.join(root, "Archive", name), "photo");
  const repo = createMetadataRepository(db);
  const file = repo.createFile({
    name,
    extension: "jpg",
    family: "image",
    mimeType: "image/jpeg",
    sizeBytes: 5,
    checksum: "abc",
    storagePath: `Archive/${name}`,
    sourceDevice: "Browser",
    status: "archived",
    archivedAt: new Date().toISOString()
  });
  const previewPath = path.join(root, ".previews", "images", `${file.id}.webp`);
  fs.writeFileSync(previewPath, "thumbnail");
  repo.upsertFilePreview({ fileId: file.id, kind: "image", status: "ready", previewPath: `.previews/images/${file.id}.webp` });
  return { file, previewPath };
}

function plant(file: string, modified: Date) {
  fs.writeFileSync(file, "x");
  fs.utimesSync(file, modified, modified);
  return file;
}

function sweep() {
  return sweepOrphanPreviews({
    storage: createStorageService(root),
    repo: createMetadataRepository(db),
    tmpDir: tmp
  });
}

describe("permanent delete", () => {
  it("removes the file's thumbnail along with the file", async () => {
    const { DELETE } = await import("@/app/api/files/[id]/delete/route");
    const { file, previewPath } = archivedFileWithPreview();

    const response = await DELETE(new Request(`http://localhost/api/files/${file.id}/delete`, { method: "DELETE" }), {
      params: Promise.resolve({ id: file.id })
    });

    expect(response.status).toBe(200);
    expect(fs.existsSync(path.join(root, "Archive", "private.jpg"))).toBe(false);
    expect(fs.existsSync(previewPath)).toBe(false);
  });

  it("still deletes a file that never got a thumbnail", async () => {
    const { DELETE } = await import("@/app/api/files/[id]/delete/route");
    const { file, previewPath } = archivedFileWithPreview();
    fs.rmSync(previewPath);

    const response = await DELETE(new Request(`http://localhost/api/files/${file.id}/delete`, { method: "DELETE" }), {
      params: Promise.resolve({ id: file.id })
    });

    expect(response.status).toBe(200);
    expect(createMetadataRepository(db).getFileById(file.id)).toBeNull();
  });
});

describe("orphan preview sweep", () => {
  it("removes thumbnails whose file is gone and keeps the rest", async () => {
    const { previewPath: kept } = archivedFileWithPreview();
    const orphan = plant(path.join(root, ".previews", "images", "file_deleted.webp"), TWO_HOURS_AGO);

    await expect(sweep()).resolves.toEqual({ removed: 1 });

    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(kept)).toBe(true);
  });

  it("leaves a thumbnail younger than an hour, which may belong to a file created during the sweep", async () => {
    const fresh = plant(path.join(root, ".previews", "images", "file_new.webp"), new Date());

    await expect(sweep()).resolves.toEqual({ removed: 0 });

    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("removes staged thumbnails a crashed worker left behind, but not one being written", async () => {
    const stale = plant(path.join(root, ".previews", "images", "file_a.webp.Ab3dEf9h.tmp"), TWO_HOURS_AGO);
    const writing = plant(path.join(root, ".previews", "images", "file_b.webp.Zy8xWv7u.tmp"), new Date());

    await sweep();

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(writing)).toBe(true);
  });

  it("removes old poster and PDF frames from the temp folder and nothing else there", async () => {
    const poster = plant(path.join(tmp, "nas-cloud-poster-file_a-x1y2z3.jpg"), TWO_HOURS_AGO);
    const page = plant(path.join(tmp, "nas-cloud-pdf-file_b-q9w8e7.png"), TWO_HOURS_AGO);
    const current = plant(path.join(tmp, "nas-cloud-poster-file_c-a1b2c3.jpg"), new Date());
    const unrelated = plant(path.join(tmp, "someone-elses-file.jpg"), TWO_HOURS_AGO);

    await expect(sweep()).resolves.toEqual({ removed: 2 });

    expect(fs.existsSync(poster)).toBe(false);
    expect(fs.existsSync(page)).toBe(false);
    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it("does nothing when no preview has been made yet", async () => {
    fs.rmSync(path.join(root, ".previews"), { recursive: true });

    await expect(sweep()).resolves.toEqual({ removed: 0 });
  });

  it("refuses a .previews folder swapped for a symlink out of the storage root", async () => {
    const outside = path.join(dir, "outside");
    fs.mkdirSync(path.join(outside, "images"), { recursive: true });
    const victim = plant(path.join(outside, "images", "file_victim.webp"), TWO_HOURS_AGO);
    fs.rmSync(path.join(root, ".previews"), { recursive: true });
    fs.symlinkSync(outside, path.join(root, ".previews"));

    await expect(sweep()).rejects.toThrow(/escapes configured root/);

    expect(fs.existsSync(victim)).toBe(true);
  });
});
