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
  });
});
