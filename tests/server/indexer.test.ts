import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { reconcileStorage } from "@/lib/server/indexer";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("reconcileStorage indexing", () => {
  it("indexes existing files from the storage tree", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Inbox", "Windows-PC"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Inbox", "Windows-PC", "fixture.3mf"), "model");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await reconcileStorage({ db, storageRoot, quietMs: 0 });
      const files = createMetadataRepository(db).listFiles();

      expect(result.indexed).toBe(1);
      expect(files[0].name).toBe("fixture.3mf");
      expect(files[0].sourceDevice).toBe("Windows-PC");
    } finally {
      db.close();
    }
  });

  it("streams file checksums without reading the whole file", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/server/indexer.ts"), "utf8");

    expect(source).toContain("createReadStream");
    expect(source).not.toContain("readFile(");
  });

  it("indexes video files from the storage tree", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(storageRoot, { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "clip.mp4"), "video bytes");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await reconcileStorage({ db, storageRoot, quietMs: 0 });
      const files = createMetadataRepository(db).listFiles();

      expect(result).toMatchObject({ scanned: 1, indexed: 1 });
      expect(files[0].checksum).toBe("96b050b919f3fca2fc8b6923537136a197ad13c583beb1438d1a12ccbc999c42");
    } finally {
      db.close();
    }
  });

  it("indexes files under Archive as archived records", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Archive", "2026", "04"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Archive", "2026", "04", "old-model.stl"), "model");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      await reconcileStorage({ db, storageRoot, quietMs: 0 });
      const files = createMetadataRepository(db).listFiles({ includeArchived: true });

      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        name: "old-model.stl",
        status: "archived",
        categoryId: "cat_archive",
        storagePath: "Archive/2026/04/old-model.stl"
      });
      expect(createMetadataRepository(db).listFiles()).toEqual([]);
    } finally {
      db.close();
    }
  });
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-reconcile-"));
  createdDirs.push(dir);
  const storageRoot = path.join(dir, "storage");
  const db = createDatabase(path.join(dir, "test.sqlite"));
  const repo = createMetadataRepository(db);
  const abs = (relativePath: string) => path.join(storageRoot, relativePath);
  const write = (relativePath: string, contents: string) => {
    fs.mkdirSync(path.dirname(abs(relativePath)), { recursive: true });
    fs.writeFileSync(abs(relativePath), contents);
  };
  const move = (from: string, to: string) => {
    fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
    fs.renameSync(abs(from), abs(to));
  };
  const run = (options: { quietMs?: number; budgetMs?: number } = { quietMs: 0 }) =>
    reconcileStorage({ db, storageRoot, ...options });
  const paths = () =>
    (db.prepare("select storage_path as p, status from files order by p").all() as { p: string; status: string }[]).map(
      (row) => `${row.status} ${row.p}`
    );
  return { db, repo, storageRoot, abs, write, move, run, paths };
}

describe("reconcileStorage", () => {
  it("skips app-internal folders and SMB client junk", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "model");
      t.write(".uploads/session.part", "partial");
      t.write(".previews/images/file_1.webp", "thumb");
      t.write("Inbox/Mac/.DS_Store", "junk");
      t.write("Inbox/Mac/._bracket.stl", "junk");
      t.write("Inbox/PC/Thumbs.db", "junk");
      t.write("Inbox/PC/desktop.ini", "junk");
      t.write("Inbox/PC/~$report.docx", "lock");

      const result = await t.run();

      expect(result).toMatchObject({ scanned: 1, indexed: 1 });
      expect(t.paths()).toEqual(["active Inbox/Mac/bracket.stl"]);
    } finally {
      t.db.close();
    }
  });

  it("defers files that changed within the quiet period", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/still-copying.stl", "model");

      const result = await t.run({});

      expect(result).toMatchObject({ indexed: 0, deferred: 1 });
      expect(t.paths()).toEqual([]);
    } finally {
      t.db.close();
    }
  });

  it("does not call a just-renamed file missing while its new path is still deferred", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "bracket model");
      await t.run();
      const original = t.repo.listFiles()[0];

      t.move("Inbox/Mac/bracket.stl", "Inbox/Mac/bracket-final.stl");
      const early = await t.run({});

      expect(early).toMatchObject({ deferred: 1, missing: 0, relinked: 0 });
      expect(t.repo.getFileById(original.id)).toMatchObject({ status: "active" });

      const later = await t.run();
      expect(later).toMatchObject({ relinked: 1, missing: 0 });
      expect(t.repo.getFileById(original.id)).toMatchObject({ storagePath: "Inbox/Mac/bracket-final.stl" });
    } finally {
      t.db.close();
    }
  });

  it("relinks a renamed file so its tags and share links survive", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "bracket model");
      await t.run();
      const original = t.repo.listFiles()[0];
      const tag = t.repo.createTag({ name: "printed" });
      t.repo.setFileTags(original.id, [tag.id]);
      t.repo.createFileShareLink({ fileId: original.id, tokenHash: "hash", createdByUserId: "user_1" });

      t.move("Inbox/Mac/bracket.stl", "Inbox/Mac/bracket-final.3mf");
      const result = await t.run();

      const files = t.repo.listFiles();
      expect(result).toMatchObject({ relinked: 1, indexed: 0, missing: 0 });
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        id: original.id,
        name: "bracket-final.3mf",
        extension: "3mf",
        storagePath: "Inbox/Mac/bracket-final.3mf",
        status: "active"
      });
      expect(files[0].tags.map((entry) => entry.name)).toEqual(["printed"]);
      expect(t.repo.listFileShareLinks(original.id)).toHaveLength(1);
    } finally {
      t.db.close();
    }
  });

  it("keeps the display name when a file only changes folder", async () => {
    const t = setup();
    try {
      t.write("Inbox/Restored/file_9-Bracket.stl", "bracket model");
      const file = t.repo.createFile({
        name: "Bracket.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 13,
        checksum: sha256("bracket model"),
        storagePath: "Inbox/Restored/file_9-Bracket.stl",
        sourceDevice: "Mac"
      });

      t.move("Inbox/Restored/file_9-Bracket.stl", "Inbox/Mac/file_9-Bracket.stl");
      await t.run();

      expect(t.repo.getFileById(file.id)).toMatchObject({
        name: "Bracket.stl",
        storagePath: "Inbox/Mac/file_9-Bracket.stl"
      });
    } finally {
      t.db.close();
    }
  });

  it("marks a deleted file missing and restores it when it reappears", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/keep.stl", "keep");
      t.write("Inbox/Mac/gone.stl", "gone");
      await t.run();

      fs.unlinkSync(t.abs("Inbox/Mac/gone.stl"));
      const afterDelete = await t.run();

      expect(afterDelete).toMatchObject({ missing: 1, relinked: 0 });
      expect(t.paths()).toEqual(["missing Inbox/Mac/gone.stl", "active Inbox/Mac/keep.stl"]);

      const again = await t.run();
      expect(again.missing).toBe(0);

      t.write("Inbox/Mac/gone.stl", "gone");
      const afterReturn = await t.run();

      expect(afterReturn).toMatchObject({ restored: 1, indexed: 0 });
      expect(t.paths()).toEqual(["active Inbox/Mac/gone.stl", "active Inbox/Mac/keep.stl"]);
    } finally {
      t.db.close();
    }
  });

  it("assigns the project from a Projects/<slug>/ path and never clears one", async () => {
    const t = setup();
    try {
      const project = t.repo.createProject({ name: "Garden Shed" });
      t.write(`Projects/${project.slug}/plans/shed.stl`, "shed");
      t.write("Projects/not-a-project/stray.stl", "stray");
      await t.run();

      const bySlugPath = Object.fromEntries(t.repo.listFiles().map((file) => [file.name, file.projectId]));
      expect(bySlugPath).toEqual({ "shed.stl": project.id, "stray.stl": null });

      t.move(`Projects/${project.slug}/plans/shed.stl`, "Inbox/Mac/shed.stl");
      await t.run();

      expect(t.repo.listFiles().find((file) => file.name === "shed.stl")).toMatchObject({
        projectId: project.id,
        storagePath: "Inbox/Mac/shed.stl"
      });
    } finally {
      t.db.close();
    }
  });

  it("relinks duplicate content to the row with the same name first", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/a.stl", "same bytes");
      t.write("Inbox/Mac/b.stl", "same bytes");
      await t.run();
      const before = Object.fromEntries(t.repo.listFiles().map((file) => [file.name, file.id]));

      t.move("Inbox/Mac/b.stl", "Inbox/PC/b.stl");
      t.move("Inbox/Mac/a.stl", "Inbox/PC/a.stl");
      const result = await t.run();

      const after = Object.fromEntries(t.repo.listFiles().map((file) => [file.storagePath, file.id]));
      expect(result).toMatchObject({ relinked: 2, indexed: 0, missing: 0 });
      expect(after).toEqual({ "Inbox/PC/a.stl": before["a.stl"], "Inbox/PC/b.stl": before["b.stl"] });
    } finally {
      t.db.close();
    }
  });

  it("stops hashing at the budget but always makes progress", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/a.stl", "a");
      t.write("Inbox/Mac/b.stl", "b");
      t.write("Inbox/Mac/c.stl", "c");

      const result = await t.run({ quietMs: 0, budgetMs: 0 });

      expect(result).toMatchObject({ indexed: 1, deferred: 2 });
      expect(t.paths()).toEqual(["active Inbox/Mac/a.stl"]);
    } finally {
      t.db.close();
    }
  });

  it.skipIf(process.getuid?.() === 0)("counts an unreadable file as deferred instead of aborting", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/locked.stl", "locked");
      t.write("Inbox/Mac/open.stl", "open");
      fs.chmodSync(t.abs("Inbox/Mac/locked.stl"), 0o000);

      const result = await t.run();

      expect(result).toMatchObject({ indexed: 1, deferred: 1 });
      expect(t.paths()).toEqual(["active Inbox/Mac/open.stl"]);
    } finally {
      fs.chmodSync(t.abs("Inbox/Mac/locked.stl"), 0o644);
      t.db.close();
    }
  });

  it("refuses to run against an empty root when files are indexed", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "model");
      await t.run();

      fs.rmSync(t.storageRoot, { recursive: true, force: true });

      await expect(t.run()).rejects.toThrow(/storage root/i);
      expect(t.paths()).toEqual(["active Inbox/Mac/bracket.stl"]);
    } finally {
      t.db.close();
    }
  });

  it("queues a preview for a newly indexed active image only", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/photo.png", "png");
      t.write("Archive/2026/01/old.png", "old png");
      await t.run();

      const [active] = t.repo.listFiles();
      const [archived] = t.repo.listFiles({ includeArchived: true }).filter((file) => file.status === "archived");
      expect(t.repo.getFilePreview(active.id, "image")).toMatchObject({ status: "pending" });
      expect(t.repo.getFilePreview(archived.id, "image")).toBeNull();
    } finally {
      t.db.close();
    }
  });
});

function sha256(contents: string): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}
