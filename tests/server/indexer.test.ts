import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { scanStorageRoot } from "@/lib/server/indexer";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanStorageRoot", () => {
  it("indexes existing files from the storage tree", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Inbox", "Windows-PC"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Inbox", "Windows-PC", "fixture.3mf"), "model");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await scanStorageRoot({ db, storageRoot });
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
      const result = await scanStorageRoot({ db, storageRoot });
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
      await scanStorageRoot({ db, storageRoot });
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

  it("skips the app's internal root entries and rebuilds project membership", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, ".previews", "images"), { recursive: true });
    fs.mkdirSync(path.join(storageRoot, ".uploads"), { recursive: true });
    fs.mkdirSync(path.join(storageRoot, "Projects", "garden-shed", "Inbox"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, ".previews", "images", "file_abc.webp"), "thumb");
    fs.writeFileSync(path.join(storageRoot, ".uploads", "upload_inflight.part"), "partial");
    fs.writeFileSync(path.join(storageRoot, ".nas-cloud-healthcheck"), "ok");
    fs.writeFileSync(path.join(storageRoot, "Projects", "garden-shed", "Inbox", "bracket.stl"), "solid");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await scanStorageRoot({ db, storageRoot });
      const repo = createMetadataRepository(db);
      const files = repo.listFiles({ includeArchived: true });
      const projects = repo.listProjects();

      expect(result).toEqual({ scanned: 1, indexed: 1 });
      expect(files).toHaveLength(1);
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({ slug: "garden-shed", name: "Garden Shed" });
      expect(files[0]).toMatchObject({ name: "bracket.stl", projectId: projects[0].id });
    } finally {
      db.close();
    }
  });

  it("attaches files to an existing project instead of creating a duplicate", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Projects", "garden-shed", "Inbox"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Projects", "garden-shed", "Inbox", "bracket.stl"), "solid");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Garden shed" });
      await scanStorageRoot({ db, storageRoot });

      expect(repo.listProjects()).toHaveLength(1);
      expect(repo.listFiles()[0].projectId).toBe(project.id);
    } finally {
      db.close();
    }
  });

  it("leaves files unattached when a Projects folder name is not a slug", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Projects", "My Stuff"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Projects", "My Stuff", "a.stl"), "solid");
    fs.writeFileSync(path.join(storageRoot, "Projects", "My Stuff", "b.stl"), "solid");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await scanStorageRoot({ db, storageRoot });
      const repo = createMetadataRepository(db);

      expect(result.indexed).toBe(2);
      expect(repo.listProjects()).toEqual([]);
      expect(repo.listFiles().map((file) => file.projectId)).toEqual([null, null]);
    } finally {
      db.close();
    }
  });

  it("still indexes dot-directories nested inside user folders", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Inbox", "Mac", ".config"), { recursive: true });
    fs.writeFileSync(path.join(storageRoot, "Inbox", "Mac", ".config", "settings.txt"), "kept");

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await scanStorageRoot({ db, storageRoot });

      expect(result.indexed).toBe(1);
    } finally {
      db.close();
    }
  });

  it("ignores symlinks", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-index-"));
    createdDirs.push(dir);
    const storageRoot = path.join(dir, "storage");
    fs.mkdirSync(path.join(storageRoot, "Inbox", "Mac"), { recursive: true });
    fs.mkdirSync(path.join(dir, "outside-dir"));
    fs.writeFileSync(path.join(dir, "outside.txt"), "outside-root");
    fs.writeFileSync(path.join(dir, "outside-dir", "note.txt"), "outside-root");
    fs.symlinkSync(path.join(dir, "outside.txt"), path.join(storageRoot, "Inbox", "Mac", "link.txt"));
    fs.symlinkSync(path.join(dir, "outside-dir"), path.join(storageRoot, "Inbox", "Mac", "linked-dir"));

    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const result = await scanStorageRoot({ db, storageRoot });

      expect(result).toEqual({ scanned: 0, indexed: 0 });
    } finally {
      db.close();
    }
  });
});
