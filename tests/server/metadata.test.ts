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
});
