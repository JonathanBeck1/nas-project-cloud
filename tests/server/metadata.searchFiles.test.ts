import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "@/lib/server/db";
import { createMetadataRepository, SEARCH_FILES_LIMIT } from "@/lib/server/metadata";

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

function freshRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-search-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "search.sqlite"));
  createdDbs.push(db);
  return createMetadataRepository(db);
}

describe("metadata.searchFiles", () => {
  it("matches against name, storage path, and extension with case-insensitive LIKE", () => {
    const repo = freshRepo();
    const stl = repo.createFile({
      name: "Bracket.STL",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 1024,
      checksum: "a",
      storagePath: "Inbox/Browser/Bracket.STL",
      sourceDevice: "Mac"
    });
    repo.createFile({
      name: "notes.pdf",
      extension: "pdf",
      family: "document",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      checksum: "b",
      storagePath: "Inbox/Browser/notes.pdf",
      sourceDevice: "Mac"
    });

    expect(repo.searchFiles({ query: "bracket" }).files.map((file) => file.id)).toEqual([stl.id]);
    expect(repo.searchFiles({ query: "STL" }).files.map((file) => file.id)).toEqual([stl.id]);
    expect(repo.searchFiles({ query: "browser/notes" }).files.map((file) => file.name)).toEqual(["notes.pdf"]);
  });

  it("composes filters across query, family, and size bounds", () => {
    const repo = freshRepo();
    const small = repo.createFile({
      name: "small.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 500_000,
      checksum: "small",
      storagePath: "Inbox/Browser/small.stl",
      sourceDevice: "Mac"
    });
    const big = repo.createFile({
      name: "big.stl",
      extension: "stl",
      family: "cad",
      mimeType: "model/stl",
      sizeBytes: 5_000_000,
      checksum: "big",
      storagePath: "Inbox/Browser/big.stl",
      sourceDevice: "Mac"
    });
    repo.createFile({
      name: "render.png",
      extension: "png",
      family: "image",
      mimeType: "image/png",
      sizeBytes: 2_000_000,
      checksum: "img",
      storagePath: "Inbox/Browser/render.png",
      sourceDevice: "Mac"
    });

    const result = repo.searchFiles({ query: "stl", family: "cad", minBytes: 1_000_000 });
    expect(result.files.map((file) => file.id)).toEqual([big.id]);
    expect(result.truncated).toBe(false);

    const small_only = repo.searchFiles({ family: "cad", maxBytes: 1_000_000 });
    expect(small_only.files.map((file) => file.id)).toEqual([small.id]);
  });

  it("filters by tag id when provided", () => {
    const repo = freshRepo();
    const tagged = repo.createFile({
      name: "tagged.pdf",
      extension: "pdf",
      family: "document",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: "tagged",
      storagePath: "Inbox/Browser/tagged.pdf",
      sourceDevice: "Mac"
    });
    repo.createFile({
      name: "untagged.pdf",
      extension: "pdf",
      family: "document",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: "untagged",
      storagePath: "Inbox/Browser/untagged.pdf",
      sourceDevice: "Mac"
    });
    const tag = repo.createTag({ name: "Reference" });
    repo.setFileTags(tagged.id, [tag.id]);

    const result = repo.searchFiles({ tagId: tag.id });
    expect(result.files.map((file) => file.id)).toEqual([tagged.id]);
  });

  it("filters by date range against uploaded_at", () => {
    const repo = freshRepo();
    const a = repo.createFile({
      name: "a.txt",
      extension: "txt",
      family: "document",
      mimeType: "text/plain",
      sizeBytes: 1,
      checksum: "a",
      storagePath: "Inbox/Browser/a.txt",
      sourceDevice: "Mac"
    });
    const b = repo.createFile({
      name: "b.txt",
      extension: "txt",
      family: "document",
      mimeType: "text/plain",
      sizeBytes: 1,
      checksum: "b",
      storagePath: "Inbox/Browser/b.txt",
      sourceDevice: "Mac"
    });

    const future = "2999-01-01T00:00:00.000Z";
    const past = "1990-01-01T00:00:00.000Z";

    expect(repo.searchFiles({ from: future }).files).toEqual([]);
    expect(repo.searchFiles({ to: past }).files).toEqual([]);
    expect(repo.searchFiles({ from: past, to: future }).files.map((file) => file.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("excludes archived files unless includeArchived is true", () => {
    const repo = freshRepo();
    const active = repo.createFile({
      name: "active.png",
      extension: "png",
      family: "image",
      mimeType: "image/png",
      sizeBytes: 1,
      checksum: "active",
      storagePath: "Inbox/Browser/active.png",
      sourceDevice: "Mac"
    });
    const archived = repo.createFile({
      name: "archived.png",
      extension: "png",
      family: "image",
      mimeType: "image/png",
      sizeBytes: 1,
      checksum: "archived",
      storagePath: "Archive/2026/04/archived.png",
      sourceDevice: "Mac",
      status: "archived",
      archivedAt: "2026-04-30T00:00:00.000Z"
    });

    expect(repo.searchFiles({ query: "png" }).files.map((file) => file.id)).toEqual([active.id]);
    expect(
      repo.searchFiles({ query: "png", includeArchived: true }).files.map((file) => file.id).sort()
    ).toEqual([active.id, archived.id].sort());
  });

  it("caps results at 200 and reports truncated", () => {
    const repo = freshRepo();
    for (let i = 0; i < SEARCH_FILES_LIMIT + 5; i += 1) {
      repo.createFile({
        name: `bulk-${i}.txt`,
        extension: "txt",
        family: "document",
        mimeType: "text/plain",
        sizeBytes: 1,
        checksum: `bulk-${i}`,
        storagePath: `Inbox/Browser/bulk-${i}.txt`,
        sourceDevice: "Mac"
      });
    }

    const result = repo.searchFiles({ query: "bulk" });
    expect(result.files).toHaveLength(SEARCH_FILES_LIMIT);
    expect(result.truncated).toBe(true);
  });
});
