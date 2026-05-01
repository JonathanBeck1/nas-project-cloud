import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createdDirs: string[] = [];
const createdDbs: AppDatabase[] = [];

afterEach(() => {
  try {
    for (const db of createdDbs.splice(0)) {
      db.close();
    }
  } finally {
    for (const dir of createdDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("metadata repository", () => {
  it("creates projects and records uploaded files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-meta-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const repo = createMetadataRepository(db);

    const project = repo.createProject({ name: "Print Parts", description: "Printer upgrades", categoryId: "cat_cad" });
    const file = repo.createFile({
      name: "bracket.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 123,
      checksum: "abc",
      storagePath: "Projects/print-parts/Inbox/bracket.stl",
      projectId: project.id,
      categoryId: "cat_cad",
      sourceDevice: "Windows-PC"
    });

    expect(repo.listProjects()).toHaveLength(1);
    expect(repo.listFiles({ query: "bracket" })).toEqual([file]);
  });

  it("creates projects with active status", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-meta-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const repo = createMetadataRepository(db);

    const project = repo.createProject({ name: "Cloud Sync" });

    expect(project.status).toBe("active");
    expect(repo.listProjects()).toEqual([project]);
  });

  it("returns active lifecycle fields for new files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "bracket.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 2048,
        checksum: "abc",
        storagePath: "Inbox/Browser/bracket.stl",
        sourceDevice: "Browser"
      });

      expect(file.status).toBe("active");
      expect(file.archivedAt).toBeNull();
    } finally {
      db.close();
    }
  });

  it("gets files by id and excludes archived files by default", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const active = repo.createFile({
        name: "active.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "active",
        storagePath: "Inbox/Browser/active.png",
        sourceDevice: "Browser"
      });
      const archived = repo.createFile({
        name: "archived.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "archived",
        storagePath: "Archive/2026/04/archived.png",
        sourceDevice: "Browser",
        status: "archived",
        archivedAt: "2026-04-30T00:00:00.000Z"
      });

      expect(repo.getFileById(active.id)?.name).toBe("active.png");
      expect(repo.getFileById("missing")).toBeNull();
      expect(repo.listFiles().map((file) => file.id)).toEqual([active.id]);
      expect(repo.listFiles({ includeArchived: true }).map((file) => file.id).sort()).toEqual([active.id, archived.id].sort());
    } finally {
      db.close();
    }
  });

  it("updates file project, category, storage path, and archive state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Print Parts" });
      const file = repo.createFile({
        name: "bracket.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/bracket.stl",
        sourceDevice: "Browser"
      });

      const assigned = repo.updateFile(file.id, {
        projectId: project.id,
        categoryId: "cat_cad",
        storagePath: "Projects/print-parts/Inbox/bracket.stl"
      });
      expect(assigned?.projectId).toBe(project.id);
      expect(assigned?.categoryId).toBe("cat_cad");
      expect(assigned?.storagePath).toBe("Projects/print-parts/Inbox/bracket.stl");

      const archived = repo.updateFile(file.id, {
        status: "archived",
        archivedAt: "2026-04-30T00:00:00.000Z",
        storagePath: "Archive/2026/04/bracket.stl"
      });
      expect(archived?.status).toBe("archived");
      expect(archived?.archivedAt).toBe("2026-04-30T00:00:00.000Z");
      expect(archived?.storagePath).toBe("Archive/2026/04/bracket.stl");
    } finally {
      db.close();
    }
  });

  it("skips file updates when expected storage path or status no longer matches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "bracket.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/bracket.stl",
        sourceDevice: "Browser"
      });

      expect(
        repo.updateFile(
          file.id,
          { storagePath: "Projects/print-parts/Inbox/bracket.stl" },
          { storagePath: "Inbox/Other/bracket.stl", status: "active" }
        )
      ).toBeNull();
      expect(repo.getFileById(file.id)?.storagePath).toBe("Inbox/Browser/bracket.stl");

      const updated = repo.updateFile(
        file.id,
        { storagePath: "Projects/print-parts/Inbox/bracket.stl" },
        { storagePath: "Inbox/Browser/bracket.stl", status: "active" }
      );

      expect(updated?.storagePath).toBe("Projects/print-parts/Inbox/bracket.stl");
    } finally {
      db.close();
    }
  });
});
