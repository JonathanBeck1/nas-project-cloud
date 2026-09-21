import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { loadWorkspaceData } from "@/lib/server/workspaceData";

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

describe("loadWorkspaceData", () => {
  it("loads projects, categories, files, and tags from the metadata repository", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-workspace-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);

    createMetadataRepository(db).createProject({ name: "Print Parts" });

    const data = loadWorkspaceData(db);

    expect(data.projects).toHaveLength(1);
    expect(data.categories.length).toBeGreaterThan(1);
    expect(data.files).toEqual([]);
    expect(data.tags).toEqual([]);
    expect(data.nextCursor).toBeNull();
  });

  it("loads only the first page of files and a cursor for the rest", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-workspace-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const insert = db.prepare(`
      insert into files
        (id, name, extension, family, mime_type, size_bytes, checksum, storage_path, source_device, uploaded_at, updated_at, status)
      values (?, ?, 'stl', 'cad', 'model/stl', 1, 'x', ?, 'd', ?, ?, 'active')
    `);
    const now = Date.now();
    db.transaction(() => {
      for (let index = 0; index < 150; index += 1) {
        const uploadedAt = new Date(now - index * 1000).toISOString();
        insert.run(`file_${index}`, `f${index}.stl`, `Inbox/d/f${index}.stl`, uploadedAt, uploadedAt);
      }
    })();

    const data = loadWorkspaceData(db);

    expect(data.files).toHaveLength(100);
    expect(data.files[0].id).toBe("file_0");
    expect(data.nextCursor).toEqual(expect.any(String));
  });
});
