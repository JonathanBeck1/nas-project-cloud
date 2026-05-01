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
});
