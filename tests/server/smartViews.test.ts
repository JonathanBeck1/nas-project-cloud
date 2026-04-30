import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { listSmartViewFiles } from "@/lib/server/smartViews";

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

describe("listSmartViewFiles", () => {
  it("returns CAD, media, unsorted, and large file views", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-views-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const repo = createMetadataRepository(db);

    repo.createFile({
      name: "fixture.3mf",
      extension: "3mf",
      family: "cad",
      mimeType: "model/3mf",
      sizeBytes: 500,
      checksum: "a",
      storagePath: "Inbox/Windows-PC/fixture.3mf",
      projectId: null,
      categoryId: "cat_cad",
      sourceDevice: "Windows-PC"
    });

    repo.createFile({
      name: "tour.webm",
      extension: "webm",
      family: "video",
      mimeType: "video/webm",
      sizeBytes: 2_000_000_000,
      checksum: "b",
      storagePath: "Inbox/MacBook-Pro/tour.webm",
      projectId: null,
      categoryId: "cat_media",
      sourceDevice: "MacBook-Pro"
    });

    expect(listSmartViewFiles(db, "cad")).toHaveLength(1);
    expect(listSmartViewFiles(db, "media")).toHaveLength(1);
    expect(listSmartViewFiles(db, "unsorted")).toHaveLength(2);
    expect(listSmartViewFiles(db, "large-files")).toHaveLength(1);
  });

  it("returns only files without projects in inbox and unsorted views", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-views-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const repo = createMetadataRepository(db);
    const project = repo.createProject({ name: "Assigned Project" });

    const unassignedFile = repo.createFile({
      name: "loose-note.txt",
      extension: "txt",
      family: "document",
      mimeType: "text/plain",
      sizeBytes: 50,
      checksum: "c",
      storagePath: "Documents/loose-note.txt",
      projectId: null,
      categoryId: "cat_documents",
      sourceDevice: "MacBook-Pro"
    });

    repo.createFile({
      name: "assigned-inbox.txt",
      extension: "txt",
      family: "document",
      mimeType: "text/plain",
      sizeBytes: 75,
      checksum: "d",
      storagePath: "Inbox/Windows-PC/assigned-inbox.txt",
      projectId: project.id,
      categoryId: "cat_inbox",
      sourceDevice: "Windows-PC"
    });

    expect(listSmartViewFiles(db, "inbox")).toEqual([unassignedFile]);
    expect(listSmartViewFiles(db, "unsorted")).toEqual([unassignedFile]);
  });

  it("includes file tags on smart view results", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-views-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    createdDbs.push(db);
    const repo = createMetadataRepository(db);

    const file = repo.createFile({
      name: "tagged-model.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 100,
      checksum: "e",
      storagePath: "Projects/tagged-model.stl",
      projectId: null,
      categoryId: "cat_cad",
      sourceDevice: "Windows-PC"
    });

    db.prepare("insert into tags (id, name, slug) values (?, ?, ?)").run("tag_priority", "Priority", "priority");
    db.prepare("insert into file_tags (file_id, tag_id) values (?, ?)").run(file.id, "tag_priority");

    expect(listSmartViewFiles(db, "cad")).toEqual([
      {
        ...file,
        tags: [{ id: "tag_priority", name: "Priority", slug: "priority" }]
      }
    ]);
  });
});
