import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { reconcileStorage } from "@/lib/server/indexer";
import { createMetadataRepository } from "@/lib/server/metadata";
import type { FileFamily } from "@/lib/shared/types";

let dir: string;
let db: AppDatabase;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-preview-attach-"));
  db = createDatabase(path.join(dir, "test.sqlite"));
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function fileOf(family: FileFamily, name: string) {
  return createMetadataRepository(db).createFile({
    name,
    extension: path.extname(name).slice(1),
    family,
    mimeType: "application/octet-stream",
    sizeBytes: 1,
    checksum: "x",
    storagePath: `Inbox/Mac/${name}`,
    sourceDevice: "Mac"
  });
}

const ready = (fileId: string, kind: "image" | "video" | "document") =>
  createMetadataRepository(db).upsertFilePreview({
    fileId,
    kind,
    status: "ready",
    previewPath: `.previews/images/${fileId}.webp`
  });

describe("previews attached to listed files", () => {
  it("attaches video posters and PDF thumbnails, not only image previews", () => {
    const repo = createMetadataRepository(db);
    const video = fileOf("video", "clip.mp4");
    const pdf = fileOf("document", "plan.pdf");
    ready(video.id, "video");
    ready(pdf.id, "document");

    const byName = new Map(repo.listFiles().map((file) => [file.name, file]));

    expect(byName.get("clip.mp4")?.preview).toMatchObject({ kind: "video", status: "ready" });
    expect(byName.get("plan.pdf")?.preview).toMatchObject({ kind: "document", status: "ready" });
    expect(repo.getFileById(video.id)?.preview?.status).toBe("ready");
  });

  it("attaches the thumbnail extracted from a 3MF file", () => {
    const repo = createMetadataRepository(db);
    const plate = fileOf("cad", "bracket.3mf");
    repo.upsertFilePreview({ fileId: plate.id, kind: "cad", status: "ready", previewPath: `.previews/images/${plate.id}.webp` });

    expect(repo.listFiles()[0].preview).toMatchObject({ kind: "cad", status: "ready" });
  });

  it("attaches a preview that is still pending or failed, so the UI can say so", () => {
    const repo = createMetadataRepository(db);
    const image = fileOf("image", "photo.png");
    repo.upsertFilePreview({ fileId: image.id, kind: "image", status: "failed", error: "bad header" });

    expect(repo.listFiles()[0].preview).toMatchObject({ status: "failed", error: "bad header" });
  });

  it("ignores a leftover preview of another kind after a rename changed the family", () => {
    const repo = createMetadataRepository(db);
    const file = fileOf("document", "notes.pdf");
    ready(file.id, "image");

    expect(repo.listFiles()[0].preview ?? null).toBeNull();

    ready(file.id, "document");
    expect(repo.listFiles()[0].preview).toMatchObject({ kind: "document" });
  });
});

describe("reindex queues previews", () => {
  it("queues previews for indexed images, videos, PDFs, 3MF and G-code files, and never resets a finished one", async () => {
    const root = path.join(dir, "storage");
    fs.mkdirSync(path.join(root, "Library"), { recursive: true });
    for (const name of ["a.png", "b.mp4", "c.pdf", "d.stl", "e.docx", "f.3mf", "g.gcode"]) {
      fs.writeFileSync(path.join(root, "Library", name), name);
    }
    const repo = createMetadataRepository(db);
    const statuses = () =>
      db
        .prepare(
          "select f.name, p.kind, p.status from file_previews p join files f on f.id = p.file_id order by f.name"
        )
        .all();

    await reconcileStorage({ db, storageRoot: root, quietMs: 0 });

    expect(statuses()).toEqual([
      { name: "a.png", kind: "image", status: "pending" },
      { name: "b.mp4", kind: "video", status: "pending" },
      { name: "c.pdf", kind: "document", status: "pending" },
      { name: "f.3mf", kind: "cad", status: "pending" },
      { name: "g.gcode", kind: "cad", status: "pending" }
    ]);

    const png = repo.listFiles({ query: "a.png" })[0];
    ready(png.id, "image");
    await reconcileStorage({ db, storageRoot: root, quietMs: 0 });

    expect(statuses()).toEqual([
      { name: "a.png", kind: "image", status: "ready" },
      { name: "b.mp4", kind: "video", status: "pending" },
      { name: "c.pdf", kind: "document", status: "pending" },
      { name: "f.3mf", kind: "cad", status: "pending" },
      { name: "g.gcode", kind: "cad", status: "pending" }
    ]);
  });

  it("backfills previews for files indexed before this existed", async () => {
    const root = path.join(dir, "storage");
    fs.mkdirSync(path.join(root, "Inbox", "Mac"), { recursive: true });
    // Indexed by an older version: the record and the bytes exist, the preview row doesn't.
    fs.writeFileSync(path.join(root, "Inbox", "Mac", "old.png"), "x");
    fileOf("image", "old.png");

    await reconcileStorage({ db, storageRoot: root, quietMs: 0 });

    expect(db.prepare("select kind, status from file_previews").all()).toEqual([{ kind: "image", status: "pending" }]);
  });
});
