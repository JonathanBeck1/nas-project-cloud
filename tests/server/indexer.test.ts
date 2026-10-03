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

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-reconcile-"));
  createdDirs.push(dir);
  const storageRoot = path.join(dir, "storage");
  fs.mkdirSync(storageRoot, { recursive: true });
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
  return { dir, db, repo, storageRoot, abs, write, move, run, paths };
}

describe("reconcileStorage: indexing new files", () => {
  it("indexes existing files from the storage tree", async () => {
    const t = setup();
    try {
      t.write("Inbox/Windows-PC/fixture.3mf", "model");

      const result = await t.run();
      const files = t.repo.listFiles();

      expect(result.indexed).toBe(1);
      expect(files[0].name).toBe("fixture.3mf");
      expect(files[0].sourceDevice).toBe("Windows-PC");
    } finally {
      t.db.close();
    }
  });

  it("streams file checksums without reading the whole file", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/server/indexer.ts"), "utf8");

    expect(source).toContain("createReadStream");
    expect(source).not.toContain("readFile(");
  });

  it("indexes video files from the storage tree", async () => {
    const t = setup();
    try {
      t.write("clip.mp4", "video bytes");

      const result = await t.run();

      expect(result).toMatchObject({ scanned: 1, indexed: 1 });
      expect(t.repo.listFiles()[0].checksum).toBe("96b050b919f3fca2fc8b6923537136a197ad13c583beb1438d1a12ccbc999c42");
    } finally {
      t.db.close();
    }
  });

  it("indexes files under Archive as archived records", async () => {
    const t = setup();
    try {
      t.write("Archive/2026/04/old-model.stl", "model");

      await t.run();
      const files = t.repo.listFiles({ includeArchived: true });

      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({
        name: "old-model.stl",
        status: "archived",
        categoryId: "cat_archive",
        storagePath: "Archive/2026/04/old-model.stl"
      });
      expect(t.repo.listFiles()).toEqual([]);
    } finally {
      t.db.close();
    }
  });

  it("skips the app's internal root entries and rebuilds project membership", async () => {
    const t = setup();
    try {
      t.write(".previews/images/file_abc.webp", "thumb");
      t.write(".uploads/upload_inflight.part", "partial");
      t.write(".nas-cloud-healthcheck", "ok");
      t.write("Projects/garden-shed/Inbox/bracket.stl", "solid");

      const result = await t.run();
      const files = t.repo.listFiles({ includeArchived: true });
      const projects = t.repo.listProjects();

      expect(result).toMatchObject({ scanned: 1, indexed: 1 });
      expect(files).toHaveLength(1);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ slug: "garden-shed", name: "Garden Shed" });
      expect(files[0]).toMatchObject({ name: "bracket.stl", projectId: projects[0].id });
    } finally {
      t.db.close();
    }
  });

  it("attaches files to an existing project instead of creating a duplicate", async () => {
    const t = setup();
    try {
      const project = t.repo.createProject({ name: "Garden shed" });
      t.write("Projects/garden-shed/Inbox/bracket.stl", "solid");

      await t.run();

      expect(t.repo.listProjects()).toHaveLength(1);
      expect(t.repo.listFiles()[0].projectId).toBe(project.id);
    } finally {
      t.db.close();
    }
  });

  it("leaves files unattached when a Projects folder name is not a slug", async () => {
    const t = setup();
    try {
      t.write("Projects/My Stuff/a.stl", "solid a");
      t.write("Projects/My Stuff/b.stl", "solid b");

      const result = await t.run();

      expect(result.indexed).toBe(2);
      expect(t.repo.listProjects()).toEqual([]);
      expect(t.repo.listFiles().map((file) => file.projectId)).toEqual([null, null]);
    } finally {
      t.db.close();
    }
  });

  it("still indexes dot-directories nested inside user folders", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/.config/settings.txt", "kept");

      const result = await t.run();

      expect(result.indexed).toBe(1);
    } finally {
      t.db.close();
    }
  });

  it("skips SMB client junk at any depth", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "model");
      t.write("Inbox/Mac/.DS_Store", "junk");
      t.write("Inbox/Mac/._bracket.stl", "junk");
      t.write("Inbox/PC/Thumbs.db", "junk");
      t.write("Inbox/PC/desktop.ini", "junk");
      t.write("Inbox/PC/~$report.docx", "lock");
      t.write("Projects/garden-shed/.recycle/old.stl", "recycled");
      t.write("Inbox/Mac/.Trashes/501/deleted.stl", "trashed");

      const result = await t.run();

      expect(result).toMatchObject({ scanned: 1, indexed: 1 });
      expect(t.paths()).toEqual(["active Inbox/Mac/bracket.stl"]);
    } finally {
      t.db.close();
    }
  });

  it("ignores symlinks", async () => {
    const t = setup();
    try {
      fs.mkdirSync(t.abs("Inbox/Mac"), { recursive: true });
      fs.mkdirSync(path.join(t.dir, "outside-dir"));
      fs.writeFileSync(path.join(t.dir, "outside.txt"), "outside-root");
      fs.writeFileSync(path.join(t.dir, "outside-dir", "note.txt"), "outside-root");
      fs.symlinkSync(path.join(t.dir, "outside.txt"), t.abs("Inbox/Mac/link.txt"));
      fs.symlinkSync(path.join(t.dir, "outside-dir"), t.abs("Inbox/Mac/linked-dir"));

      const result = await t.run();

      expect(result).toMatchObject({ scanned: 0, indexed: 0 });
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

describe("reconcileStorage: following changes made over SMB", () => {
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
      const user = t.repo.createUser({ email: "owner@example.test", name: "Owner", passwordHash: "x", role: "owner" });
      t.repo.createFileShareLink({ fileId: original.id, tokenHash: "hash", createdByUserId: user.id });

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
      expect(t.repo.listFiles().map((file) => file.name)).toEqual(["keep.stl"]);

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

  it("restores a missing file that comes back under another name", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/keep.stl", "keep");
      t.write("Inbox/Mac/gone.stl", "gone for a while");
      await t.run();
      const original = t.repo.listFiles().find((file) => file.name === "gone.stl")!;
      fs.renameSync(t.abs("Inbox/Mac/gone.stl"), path.join(t.dir, "held.stl"));
      await t.run();
      expect(t.repo.getFileById(original.id)).toMatchObject({ status: "missing" });

      fs.mkdirSync(t.abs("Inbox/PC"), { recursive: true });
      fs.renameSync(path.join(t.dir, "held.stl"), t.abs("Inbox/PC/back.stl"));
      const result = await t.run();

      expect(result).toMatchObject({ relinked: 1, indexed: 0 });
      expect(t.repo.getFileById(original.id)).toMatchObject({ status: "active", storagePath: "Inbox/PC/back.stl" });
    } finally {
      t.db.close();
    }
  });

  it("never marks a path it skips as missing, such as junk-named files the app stored itself", async () => {
    const t = setup();
    try {
      t.write("Inbox/Browser/Thumbs.db", "uploaded through the app");
      const file = t.repo.createFile({
        name: "Thumbs.db",
        extension: "db",
        family: "other",
        mimeType: "application/octet-stream",
        sizeBytes: 24,
        checksum: sha256("uploaded through the app"),
        storagePath: "Inbox/Browser/Thumbs.db",
        sourceDevice: "Browser"
      });
      t.write("Inbox/Browser/keep.stl", "keep");

      const result = await t.run();

      expect(result.missing).toBe(0);
      expect(t.repo.getFileById(file.id)).toMatchObject({ status: "active" });
    } finally {
      t.db.close();
    }
  });

  it("moves a file in and out of Archive with its archived state", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/bracket.stl", "bracket");
      await t.run();
      const original = t.repo.listFiles()[0];

      t.move("Inbox/Mac/bracket.stl", "Archive/2026/10/bracket.stl");
      await t.run();
      const archived = t.repo.getFileById(original.id);
      expect(archived).toMatchObject({ status: "archived", storagePath: "Archive/2026/10/bracket.stl" });
      expect(archived?.archivedAt).toEqual(expect.any(String));

      t.move("Archive/2026/10/bracket.stl", "Inbox/Mac/bracket.stl");
      await t.run();
      expect(t.repo.getFileById(original.id)).toMatchObject({ status: "active", archivedAt: null });
    } finally {
      t.db.close();
    }
  });

  it("puts a file moved into a project folder in that project, and takes it out when it leaves", async () => {
    const t = setup();
    try {
      const project = t.repo.createProject({ name: "Garden Shed" });
      t.write("Inbox/Mac/shed.stl", "shed");
      await t.run();
      const original = t.repo.listFiles()[0];

      t.move("Inbox/Mac/shed.stl", `Projects/${project.slug}/plans/shed.stl`);
      await t.run();
      expect(t.repo.getFileById(original.id)).toMatchObject({ projectId: project.id });

      t.move(`Projects/${project.slug}/plans/shed.stl`, "Inbox/Mac/shed.stl");
      await t.run();
      expect(t.repo.getFileById(original.id)).toMatchObject({ projectId: null, storagePath: "Inbox/Mac/shed.stl" });
    } finally {
      t.db.close();
    }
  });

  it("creates the project for a slug-shaped folder made over SMB when a file moves into it", async () => {
    const t = setup();
    try {
      t.write("Inbox/Mac/frame.stl", "frame");
      await t.run();
      const original = t.repo.listFiles()[0];

      t.move("Inbox/Mac/frame.stl", "Projects/quad-frame/frame.stl");
      await t.run();

      const [project] = t.repo.listProjects();
      expect(project).toMatchObject({ slug: "quad-frame", name: "Quad Frame" });
      expect(t.repo.getFileById(original.id)).toMatchObject({ projectId: project.id });
    } finally {
      t.db.close();
    }
  });

  it("keeps the project of a file that never lived in the project folder when it is only renamed", async () => {
    const t = setup();
    try {
      const project = t.repo.createProject({ name: "Garden Shed" });
      t.write("Inbox/Mac/legacy.stl", "legacy");
      const file = t.repo.createFile({
        name: "legacy.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 6,
        checksum: sha256("legacy"),
        storagePath: "Inbox/Mac/legacy.stl",
        sourceDevice: "Mac",
        projectId: project.id
      });

      t.move("Inbox/Mac/legacy.stl", "Inbox/Mac/legacy-v2.stl");
      await t.run();

      expect(t.repo.getFileById(file.id)).toMatchObject({ projectId: project.id, storagePath: "Inbox/Mac/legacy-v2.stl" });
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
});

function sha256(contents: string): string {
  return crypto.createHash("sha256").update(contents).digest("hex");
}
