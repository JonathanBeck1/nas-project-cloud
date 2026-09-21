import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDatabase, createDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const createdDirs: string[] = [];
const createdDbs: AppDatabase[] = [];

afterEach(() => {
  for (const db of createdDbs.splice(0)) {
    db.close();
  }
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

type SeedRow = { id: string; name: string; uploadedAt: string; projectId?: string; status?: string };

function seededRepo(rows: SeedRow[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-page-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  createdDbs.push(db);
  const repo = createMetadataRepository(db);
  const project = repo.createProject({ name: "Shed" });
  const insert = db.prepare(`
    insert into files
      (id, name, extension, family, mime_type, size_bytes, checksum, storage_path, source_device, project_id, uploaded_at, updated_at, status)
    values (@id, @name, 'stl', 'cad', 'model/stl', 1, 'x', @storagePath, 'd', @projectId, @uploadedAt, @uploadedAt, @status)
  `);
  db.transaction(() => {
    for (const row of rows) {
      insert.run({
        id: row.id,
        name: row.name,
        storagePath: `Inbox/d/${row.id}`,
        projectId: row.projectId === "shed" ? project.id : null,
        uploadedAt: row.uploadedAt,
        status: row.status ?? "active"
      });
    }
  })();
  return { db, repo, project };
}

function walk(repo: ReturnType<typeof createMetadataRepository>, filters: object, limit: number): string[] {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = repo.listFilesPage(filters, { limit, cursor });
    ids.push(...page.files.map((file) => file.id));
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-02T10:00:00.000Z";
const T3 = "2026-09-03T10:00:00.000Z";

const tiedRows: SeedRow[] = [
  { id: "f1", name: "b.stl", uploadedAt: T2 },
  { id: "f2", name: "a.stl", uploadedAt: T2 },
  { id: "f3", name: "a.stl", uploadedAt: T2 },
  { id: "f4", name: "z.stl", uploadedAt: T3, projectId: "shed" },
  { id: "f5", name: "m.stl", uploadedAt: T1, projectId: "shed" },
  { id: "f6", name: "m.stl", uploadedAt: T1 },
  { id: "f7", name: "old.stl", uploadedAt: T1, status: "archived" }
];

describe("listFilesPage", () => {
  it("walks every row exactly once in listing order, through ties on time and name", () => {
    const { repo } = seededRepo(tiedRows);
    const expected = ["f4", "f2", "f3", "f1", "f5", "f6"];

    expect(repo.listFiles().map((file) => file.id)).toEqual(expected);
    for (const limit of [1, 2, 3, 100]) {
      expect(walk(repo, {}, limit)).toEqual(expected);
    }
  });

  it("composes filters with the cursor", () => {
    const { repo, project } = seededRepo(tiedRows);

    expect(walk(repo, { projectId: project.id }, 1)).toEqual(["f4", "f5"]);
    expect(walk(repo, { query: "a.stl" }, 1)).toEqual(["f2", "f3"]);
    expect(walk(repo, { status: "archived" }, 1)).toEqual(["f7"]);
  });

  it("reports the last page with a null cursor and clamps the limit", () => {
    const { repo } = seededRepo(tiedRows);

    expect(repo.listFilesPage({}, { limit: 6 }).nextCursor).toBeNull();
    expect(repo.listFilesPage({}, { limit: 5 }).nextCursor).toEqual(expect.any(String));
    expect(repo.listFilesPage({}, { limit: 0 }).files).toHaveLength(1);
    expect(repo.listFilesPage({}).files).toHaveLength(6);
  });

  it("rejects a cursor it cannot decode", () => {
    const { repo } = seededRepo(tiedRows);

    for (const cursor of ["not-base64-json", Buffer.from('{"u":1}').toString("base64url")]) {
      expect(() => repo.listFilesPage({}, { cursor })).toThrowError(
        expect.objectContaining({ code: "INVALID_CURSOR" })
      );
    }
  });

  it("seeks through the listing index instead of sorting", () => {
    const { db, repo } = seededRepo(tiedRows);
    const cursor = repo.listFilesPage({}, { limit: 2 }).nextCursor;
    const statements: string[] = [];
    const original = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      statements.push(sql);
      return original(sql);
    }) as typeof db.prepare;

    repo.listFilesPage({}, { limit: 2, cursor });

    const listing = statements.find((sql) => /from files/.test(sql) && /limit/.test(sql)) ?? "";
    const plan = original(`explain query plan ${listing}`)
      .all({ u: T2, n: "a.stl", i: "f2", limit: 3 })
      .map((row) => (row as { detail: string }).detail)
      .join("\n");
    expect(plan).toContain("files_listing_idx");
    expect(plan).toMatch(/uploaded_at</);
    expect(plan).not.toContain("TEMP B-TREE");
  });

  it("returns a first page of 100 from 40,000 files", () => {
    const now = Date.now();
    const { repo } = seededRepo(
      Array.from({ length: 40_000 }, (_, index) => ({
        id: `file_${index}`,
        name: `f${index}.stl`,
        uploadedAt: new Date(now - index * 1000).toISOString()
      }))
    );

    const page = repo.listFilesPage({});

    expect(page.files).toHaveLength(100);
    expect(page.files[0].id).toBe("file_0");
    expect(page.nextCursor).toEqual(expect.any(String));
  });
});
