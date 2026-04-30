# Production File Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the direct-filesystem NAS Project Cloud MVP operational by adding safe download, archive, project assignment, selectable files, and real file actions.

**Architecture:** Keep TrueNAS direct filesystem storage as the source of truth and SQLite as the metadata index. Add lifecycle state to file metadata, storage-service move/read primitives, API routes that never accept raw client paths, and UI actions that update local workspace state after server success.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, Node filesystem streams, SQLite via `better-sqlite3`, Vitest, React Testing Library, Playwright.

---

## Scope

This phase builds production file operations on top of the existing MVP. It does not add permanent delete, resumable uploads, desktop apps, authentication, OpenCloud, Nextcloud, or preview generation.

## File Structure

- Modify `src/lib/shared/types.ts`: add file lifecycle fields.
- Modify `src/lib/server/db.ts`: migrate lifecycle columns.
- Modify `src/lib/server/metadata.ts`: add file lookup, lifecycle filtering, project lookup, metadata update, archive update, project assignment update.
- Modify `src/lib/server/storage.ts`: add stream/stat/read metadata helpers plus move-to-project and archive operations.
- Modify `src/app/api/files/[id]/route.ts`: real file detail GET and metadata/project PATCH.
- Create `src/app/api/files/[id]/download/route.ts`: safe streaming download.
- Create `src/app/api/files/[id]/archive/route.ts`: archive operation.
- Create `src/lib/client/fileActions.ts`: browser API helpers for file actions.
- Modify `src/components/workspace/FileGrid.tsx`: selectable file cards.
- Modify `src/components/workspace/DetailDrawer.tsx`: file actions and project assignment control.
- Modify `src/components/workspace/CommandBar.tsx`: controlled search input.
- Modify `src/components/workspace/AppShell.tsx`: selected file, filtered files, action handlers, status messages.
- Modify `tests/server/*.test.ts`: lifecycle, repository, storage, and API coverage.
- Modify `tests/components/*.test.tsx`: selection, actions, assignment, search coverage.
- Modify `tests/e2e/workspace.spec.ts`: upload-to-action smoke coverage.
- Create `docs/implementation/phase-2-file-operations.md`: operator-facing implementation summary.

## Task 1: File Lifecycle Schema And Types

**Files:**
- Modify: `src/lib/shared/types.ts`
- Modify: `src/lib/server/db.ts`
- Modify: `src/lib/server/metadata.ts`
- Modify: `tests/server/db.test.ts`
- Modify: `tests/server/metadata.test.ts`

- [ ] **Step 1: Write failing lifecycle schema test**

Add this test to `tests/server/db.test.ts`:

```ts
it("adds lifecycle columns to files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-db-"));
  createdDirs.push(dir);
  const db = createDatabase(path.join(dir, "test.sqlite"));
  try {
    const columns = db.prepare("pragma table_info(files)").all() as Array<{ name: string; dflt_value: string | null }>;

    expect(columns.map((column) => column.name)).toContain("status");
    expect(columns.map((column) => column.name)).toContain("archived_at");
    expect(columns.find((column) => column.name === "status")?.dflt_value).toBe("'active'");
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Write failing CloudFile lifecycle test**

Add this test to `tests/server/metadata.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- tests/server/db.test.ts tests/server/metadata.test.ts
```

Expected: FAIL because `status` and `archivedAt` are not implemented.

- [ ] **Step 4: Add lifecycle shared types**

Modify `src/lib/shared/types.ts`:

```ts
export type FileStatus = "active" | "archived";
```

Add to `CloudFile`:

```ts
status: FileStatus;
archivedAt: string | null;
```

- [ ] **Step 5: Add database migration columns**

Modify `src/lib/server/db.ts` inside `migrate(db)` after the base `db.exec(...)` block:

```ts
  addColumnIfMissing(db, "files", "status", "text not null default 'active'");
  addColumnIfMissing(db, "files", "archived_at", "text");
```

Add helper below `migrate`:

```ts
function addColumnIfMissing(db: AppDatabase, table: string, column: string, definition: string) {
  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((existing) => existing.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}
```

- [ ] **Step 6: Map lifecycle in metadata rows**

Modify `src/lib/server/metadata.ts`:

```ts
import type { Category, CloudFile, FileFamily, FileStatus, Project, ProjectStatus, Tag } from "@/lib/shared/types";
```

Add to `FileRow`:

```ts
status: FileStatus;
archived_at: string | null;
```

Add to `CreateFileInput`:

```ts
status?: FileStatus;
archivedAt?: string | null;
```

Add to inserted file object:

```ts
status: input.status ?? "active",
archivedAt: input.archivedAt ?? null,
```

Update the insert SQL columns and values:

```sql
status, archived_at
```

```sql
@status, @archivedAt
```

Update `fileFromRow`:

```ts
status: row.status,
archivedAt: row.archived_at,
```

- [ ] **Step 7: Verify lifecycle tests pass**

Run:

```bash
npm test -- tests/server/db.test.ts tests/server/metadata.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit lifecycle schema**

```bash
git add src/lib/shared/types.ts src/lib/server/db.ts src/lib/server/metadata.ts tests/server/db.test.ts tests/server/metadata.test.ts
git commit -m "feat: add file lifecycle metadata"
```

## Task 2: Metadata Repository File Operations

**Files:**
- Modify: `src/lib/server/metadata.ts`
- Modify: `tests/server/metadata.test.ts`

- [ ] **Step 1: Write failing repository operation tests**

Add tests to `tests/server/metadata.test.ts`:

```ts
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
    expect(repo.listFiles({ includeArchived: true }).map((file) => file.id)).toEqual([archived.id, active.id]);
  } finally {
    db.close();
  }
});
```

Add:

```ts
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
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- tests/server/metadata.test.ts
```

Expected: FAIL because `getFileById`, `includeArchived`, and `updateFile` are missing.

- [ ] **Step 3: Add repository types**

In `src/lib/server/metadata.ts`, update `ListFilesFilters`:

```ts
includeArchived?: boolean;
```

Add:

```ts
type UpdateFileInput = {
  projectId?: string | null;
  categoryId?: string | null;
  storagePath?: string;
  status?: FileStatus;
  archivedAt?: string | null;
};
```

- [ ] **Step 4: Add repository methods**

Inside `createMetadataRepository(db)` add:

```ts
    getFileById(id: string): CloudFile | null {
      const row = db.prepare<[string], FileRow>("select * from files where id = ? limit 1").get(id);
      return row ? filesFromRowsWithTags(db, [row])[0] : null;
    },

    getProjectById(id: string): Project | null {
      const row = db.prepare<[string], ProjectRow>("select * from projects where id = ? limit 1").get(id);
      return row ? projectFromRow(row) : null;
    },

    updateFile(id: string, input: UpdateFileInput): CloudFile | null {
      const existing = this.getFileById(id);
      if (!existing) {
        return null;
      }

      const next = {
        id,
        projectId: input.projectId !== undefined ? input.projectId : existing.projectId,
        categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        storagePath: input.storagePath ?? existing.storagePath,
        status: input.status ?? existing.status,
        archivedAt: input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
        updatedAt: new Date().toISOString()
      };

      db.prepare(`
        update files
        set project_id = @projectId,
            category_id = @categoryId,
            storage_path = @storagePath,
            status = @status,
            archived_at = @archivedAt,
            updated_at = @updatedAt
        where id = @id
      `).run(next);

      return this.getFileById(id);
    },
```

- [ ] **Step 5: Exclude archived files by default**

In `listFiles`, before query/category/project filters:

```ts
      if (!filters.includeArchived) {
        where.push("status = 'active'");
      }
```

Update parameter typing to allow booleans without putting them in SQL params:

```ts
const params: Record<string, string | null> = {};
```

No boolean parameter should be added to `params`.

- [ ] **Step 6: Verify repository tests pass**

```bash
npm test -- tests/server/metadata.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit repository operations**

```bash
git add src/lib/server/metadata.ts tests/server/metadata.test.ts
git commit -m "feat: add file metadata operations"
```

## Task 3: Filesystem Read, Move, And Archive Service

**Files:**
- Modify: `src/lib/server/storage.ts`
- Modify: `tests/server/storage.test.ts`

- [ ] **Step 1: Write failing storage operation tests**

Add to `tests/server/storage.test.ts`:

```ts
it("returns file stats for a stored relative path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
  createdDirs.push(dir);
  const storage = createStorageService(dir);
  const stored = await storage.writeUpload({
    target: { kind: "inbox", sourceDevice: "Browser" },
    filename: "manual.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("manual")
  });

  const details = await storage.fileDetails(stored.relativePath);

  expect(details.sizeBytes).toBe(6);
  expect(details.absolutePath.endsWith("manual.pdf")).toBe(true);
});
```

Add:

```ts
it("moves files into a project and archive without leaving storage root", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-storage-"));
  createdDirs.push(dir);
  const storage = createStorageService(dir);
  const stored = await storage.writeUpload({
    target: { kind: "inbox", sourceDevice: "Browser" },
    filename: "bracket.stl",
    mimeType: "model/stl",
    bytes: Buffer.from("model")
  });

  const moved = await storage.moveToProject({
    currentRelativePath: stored.relativePath,
    projectSlug: "print-parts",
    filename: "bracket.stl"
  });
  expect(moved.relativePath).toBe("Projects/print-parts/Inbox/bracket.stl");
  expect(fs.existsSync(path.join(dir, moved.relativePath))).toBe(true);

  const archived = await storage.archiveFile({
    currentRelativePath: moved.relativePath,
    filename: "bracket.stl",
    now: new Date("2026-04-30T00:00:00.000Z")
  });
  expect(archived.relativePath).toBe("Archive/2026/04/bracket.stl");
  expect(fs.existsSync(path.join(dir, archived.relativePath))).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- tests/server/storage.test.ts
```

Expected: FAIL because `fileDetails`, `moveToProject`, and `archiveFile` are missing.

- [ ] **Step 3: Add storage operation types**

In `src/lib/server/storage.ts`:

```ts
export type MoveToProjectInput = {
  currentRelativePath: string;
  projectSlug: string;
  filename: string;
};

export type ArchiveFileInput = {
  currentRelativePath: string;
  filename: string;
  now?: Date;
};
```

- [ ] **Step 4: Add file details helper**

Inside returned object from `createStorageService`:

```ts
    async fileDetails(relativePath: string) {
      const absolutePath = this.absolutePathFor(relativePath);
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new Error("Storage path is not a file");
      }
      return {
        absolutePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    },
```

- [ ] **Step 5: Add move helpers**

Inside returned object:

```ts
    async moveToProject(input: MoveToProjectInput): Promise<{ absolutePath: string; relativePath: string }> {
      const from = this.absolutePathFor(input.currentRelativePath);
      const directory = path.join(storageRoot, "Projects", sanitizePathSegment(input.projectSlug), "Inbox");
      return moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
    },

    async archiveFile(input: ArchiveFileInput): Promise<{ absolutePath: string; relativePath: string }> {
      const now = input.now ?? new Date();
      const from = this.absolutePathFor(input.currentRelativePath);
      const year = String(now.getUTCFullYear());
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const directory = path.join(storageRoot, "Archive", year, month);
      return moveIntoDirectory({
        storageRoot,
        from,
        directory,
        filename: input.filename
      });
    },
```

Add helper below `nextAvailablePath`:

```ts
async function moveIntoDirectory(input: {
  storageRoot: string;
  from: string;
  directory: string;
  filename: string;
}): Promise<{ absolutePath: string; relativePath: string }> {
  await fs.mkdir(input.directory, { recursive: true });
  const absolutePath = await nextAvailablePath(input.directory, sanitizeFilename(input.filename));
  await fs.rename(input.from, absolutePath);
  return {
    absolutePath,
    relativePath: path.relative(input.storageRoot, absolutePath).split(path.sep).join("/")
  };
}
```

- [ ] **Step 6: Verify storage tests pass**

```bash
npm test -- tests/server/storage.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit storage operations**

```bash
git add src/lib/server/storage.ts tests/server/storage.test.ts
git commit -m "feat: add filesystem file operations"
```

## Task 4: File Detail And Download API

**Files:**
- Modify: `src/app/api/files/[id]/route.ts`
- Create: `src/app/api/files/[id]/download/route.ts`
- Modify: `tests/server/filesApi.test.ts`

- [ ] **Step 1: Write failing file detail API test**

Add to `tests/server/filesApi.test.ts`:

```ts
it("returns file detail by id", async () => {
  const file = {
    id: "file_123",
    name: "manual.pdf",
    storagePath: "Inbox/Browser/manual.pdf"
  };
  mocks.repo.getFileById.mockReturnValue(file);

  const response = await fileDetailGet(new Request("http://localhost/api/files/file_123"), {
    params: Promise.resolve({ id: "file_123" })
  });

  await expect(response.json()).resolves.toEqual({ file });
});
```

The test file currently imports route handlers. Add imports for the detail route:

```ts
import { GET as fileDetailGet } from "@/app/api/files/[id]/route";
```

- [ ] **Step 2: Write failing download API tests**

Add to `tests/server/filesApi.test.ts`:

```ts
it("streams a file download with safe headers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
  createdDirs.push(dir);
  fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
  mocks.config.appConfig.storageRoot = dir;
  mocks.repo.getFileById.mockReturnValue({
    id: "file_123",
    name: "manual.pdf",
    mimeType: "application/pdf",
    storagePath: "Inbox/Browser/manual.pdf"
  });

  const response = await fileDownloadGet(new Request("http://localhost/api/files/file_123/download"), {
    params: Promise.resolve({ id: "file_123" })
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toContain('filename="manual.pdf"');
  await expect(response.text()).resolves.toBe("manual");
});
```

Add import:

```ts
import { GET as fileDownloadGet } from "@/app/api/files/[id]/download/route";
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: FAIL because detail/download routes are not implemented.

- [ ] **Step 4: Implement file detail GET**

Replace `src/app/api/files/[id]/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = createMetadataRepository(getDatabase()).getFileById(id);

  if (!file) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  return NextResponse.json({ file });
}
```

- [ ] **Step 5: Implement safe download route**

Create `src/app/api/files/[id]/download/route.ts`:

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const storage = createStorageService();
  let absolutePath: string;
  let size: number;

  try {
    absolutePath = storage.absolutePathFor(file.storagePath);
    const details = await stat(absolutePath);
    if (!details.isFile()) {
      return NextResponse.json({ error: "file not found" }, { status: 404 });
    }
    size = details.size;
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(absolutePath));
  return new Response(stream as ReadableStream, {
    headers: {
      "content-type": file.mimeType || "application/octet-stream",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${encodeFilename(basename(file.name))}"`
    }
  });
}

function encodeFilename(filename: string): string {
  return filename.replace(/["\\]/g, "_");
}
```

- [ ] **Step 6: Verify file API tests pass**

```bash
npm test -- tests/server/filesApi.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit file detail/download API**

```bash
git add src/app/api/files/[id]/route.ts src/app/api/files/[id]/download/route.ts tests/server/filesApi.test.ts
git commit -m "feat: add file detail and download API"
```

## Task 5: Archive And Project Assignment API

**Files:**
- Modify: `src/app/api/files/[id]/route.ts`
- Create: `src/app/api/files/[id]/archive/route.ts`
- Modify: `tests/server/filesApi.test.ts`

- [ ] **Step 1: Write failing project assignment API test**

Add to `tests/server/filesApi.test.ts`:

```ts
it("moves a file into a project on patch", async () => {
  mocks.repo.getFileById.mockReturnValue({
    id: "file_123",
    name: "bracket.stl",
    storagePath: "Inbox/Browser/bracket.stl",
    status: "active"
  });
  mocks.repo.getProjectById.mockReturnValue({
    id: "proj_123",
    slug: "print-parts",
    name: "Print Parts"
  });
  mocks.storage.moveToProject.mockResolvedValue({
    absolutePath: "/tmp/Projects/print-parts/Inbox/bracket.stl",
    relativePath: "Projects/print-parts/Inbox/bracket.stl"
  });
  mocks.repo.updateFile.mockReturnValue({
    id: "file_123",
    name: "bracket.stl",
    projectId: "proj_123",
    storagePath: "Projects/print-parts/Inbox/bracket.stl"
  });

  const response = await fileDetailPatch(
    new Request("http://localhost/api/files/file_123", {
      method: "PATCH",
      body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_cad" })
    }),
    { params: Promise.resolve({ id: "file_123" }) }
  );

  expect(response.status).toBe(200);
  expect(mocks.storage.moveToProject).toHaveBeenCalledWith({
    currentRelativePath: "Inbox/Browser/bracket.stl",
    projectSlug: "print-parts",
    filename: "bracket.stl"
  });
  expect(mocks.repo.updateFile).toHaveBeenCalledWith("file_123", {
    projectId: "proj_123",
    categoryId: "cat_cad",
    storagePath: "Projects/print-parts/Inbox/bracket.stl"
  });
});
```

- [ ] **Step 2: Write failing archive API test**

Add:

```ts
it("archives a file by moving storage and updating metadata", async () => {
  mocks.repo.getFileById.mockReturnValue({
    id: "file_123",
    name: "manual.pdf",
    storagePath: "Inbox/Browser/manual.pdf",
    status: "active"
  });
  mocks.storage.archiveFile.mockResolvedValue({
    absolutePath: "/tmp/Archive/2026/04/manual.pdf",
    relativePath: "Archive/2026/04/manual.pdf"
  });
  mocks.repo.updateFile.mockReturnValue({
    id: "file_123",
    name: "manual.pdf",
    status: "archived",
    archivedAt: "2026-04-30T00:00:00.000Z",
    storagePath: "Archive/2026/04/manual.pdf"
  });

  const response = await fileArchivePost(new Request("http://localhost/api/files/file_123/archive", { method: "POST" }), {
    params: Promise.resolve({ id: "file_123" })
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    file: {
      id: "file_123",
      status: "archived"
    }
  });
  expect(mocks.storage.archiveFile).toHaveBeenCalledWith({
    currentRelativePath: "Inbox/Browser/manual.pdf",
    filename: "manual.pdf"
  });
});
```

Add imports:

```ts
import { PATCH as fileDetailPatch } from "@/app/api/files/[id]/route";
import { POST as fileArchivePost } from "@/app/api/files/[id]/archive/route";
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- tests/server/filesApi.test.ts
```

Expected: FAIL because PATCH and archive route are missing.

- [ ] **Step 4: Implement PATCH in file detail route**

Extend `src/app/api/files/[id]/route.ts`:

```ts
import { z } from "zod";
import { createStorageService } from "@/lib/server/storage";

const updateFileSchema = z.object({
  projectId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional()
});
```

Add:

```ts
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid file update" }, { status: 400 });
  }

  const parsed = updateFileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid file update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const update: { projectId?: string | null; categoryId?: string | null; storagePath?: string } = {};

  if (parsed.data.categoryId !== undefined) {
    update.categoryId = parsed.data.categoryId;
  }

  if (parsed.data.projectId !== undefined) {
    update.projectId = parsed.data.projectId;
    if (parsed.data.projectId) {
      const project = repo.getProjectById(parsed.data.projectId);
      if (!project) {
        return NextResponse.json({ error: "project not found" }, { status: 404 });
      }
      const moved = await createStorageService().moveToProject({
        currentRelativePath: file.storagePath,
        projectSlug: project.slug,
        filename: file.name
      });
      update.storagePath = moved.relativePath;
    }
  }

  const updated = repo.updateFile(id, update);
  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}
```

- [ ] **Step 5: Implement archive route**

Create `src/app/api/files/[id]/archive/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);

  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  let moved;
  try {
    moved = await createStorageService().archiveFile({
      currentRelativePath: file.storagePath,
      filename: file.name
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const archivedAt = new Date().toISOString();
  const updated = repo.updateFile(id, {
    storagePath: moved.relativePath,
    status: "archived",
    archivedAt
  });

  return updated
    ? NextResponse.json({ file: updated })
    : NextResponse.json({ error: "file not found" }, { status: 404 });
}
```

- [ ] **Step 6: Verify API tests pass**

```bash
npm test -- tests/server/filesApi.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit archive and assignment API**

```bash
git add src/app/api/files/[id]/route.ts src/app/api/files/[id]/archive/route.ts tests/server/filesApi.test.ts
git commit -m "feat: add file archive and assignment API"
```

## Task 6: Client File Action Helpers

**Files:**
- Create: `src/lib/client/fileActions.ts`
- Create: `tests/components/fileActions.test.tsx`

- [ ] **Step 1: Write failing client helper tests**

Create `tests/components/fileActions.test.tsx`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveFile, updateFileAssignment } from "@/lib/client/fileActions";

describe("fileActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("archives files through the archive endpoint", async () => {
    const file = { id: "file_123", status: "archived" };
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(archiveFile("file_123")).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith("/api/files/file_123/archive", { method: "POST" });
  });

  it("updates file assignment through patch", async () => {
    const file = { id: "file_123", projectId: "proj_123" };
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify({ file }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateFileAssignment("file_123", { projectId: "proj_123", categoryId: "cat_cad" })).resolves.toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_123",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_cad" })
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm test -- tests/components/fileActions.test.tsx
```

Expected: FAIL because `@/lib/client/fileActions` does not exist.

- [ ] **Step 3: Implement client helpers**

Create `src/lib/client/fileActions.ts`:

```ts
import type { CloudFile } from "@/lib/shared/types";

export type FileAssignmentInput = {
  projectId?: string | null;
  categoryId?: string | null;
};

export async function archiveFile(fileId: string): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}/archive`, {
      method: "POST"
    })
  );
}

export async function updateFileAssignment(fileId: string, input: FileAssignmentInput): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export function downloadUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}/download`;
}

async function fileFromResponse(response: Response): Promise<CloudFile> {
  let payload: { file?: CloudFile; error?: string };
  try {
    payload = (await response.json()) as { file?: CloudFile; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.file) {
    throw new Error(payload.error ?? "File action failed");
  }

  return payload.file;
}
```

- [ ] **Step 4: Verify helper tests pass**

```bash
npm test -- tests/components/fileActions.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit client helpers**

```bash
git add src/lib/client/fileActions.ts tests/components/fileActions.test.tsx
git commit -m "feat: add client file action helpers"
```

## Task 7: Selectable File Grid

**Files:**
- Modify: `src/components/workspace/FileGrid.tsx`
- Modify: `tests/components/FileGrid.test.tsx`

- [ ] **Step 1: Write failing selection test**

Add to `tests/components/FileGrid.test.tsx`:

```tsx
it("selects a file card", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();

  render(<FileGrid files={[fixture]} selectedFileId={fixture.id} onSelectFile={onSelect} />);

  const card = screen.getByRole("button", { name: "bracket.stl" });
  expect(card).toHaveAttribute("aria-pressed", "true");

  await user.click(card);

  expect(onSelect).toHaveBeenCalledWith(fixture);
});
```

Add imports:

```ts
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/components/FileGrid.test.tsx
```

Expected: FAIL because cards are not buttons and props are missing.

- [ ] **Step 3: Update FileGrid props**

Modify `src/components/workspace/FileGrid.tsx`:

```ts
type FileGridProps = {
  files: CloudFile[];
  selectedFileId?: string | null;
  onSelectFile?: (file: CloudFile) => void;
};
```

Change `FileGrid` signature:

```ts
export function FileGrid({ files, selectedFileId = null, onSelectFile }: FileGridProps) {
```

- [ ] **Step 4: Convert cards to buttons**

Replace each `<article>` card with:

```tsx
<button
  key={file.id}
  type="button"
  aria-pressed={selectedFileId === file.id}
  onClick={() => onSelectFile?.(file)}
  className={[
    "min-w-0 rounded-md border bg-panel p-3 text-left shadow-panel transition hover:border-muted",
    selectedFileId === file.id ? "border-accent ring-2 ring-accent/20" : "border-line"
  ].join(" ")}
>
  <div className="flex min-w-0 items-start gap-3">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
      <Icon aria-hidden="true" className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="truncate text-sm font-semibold text-ink">{file.name}</h3>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{formatBytes(file.sizeBytes)}</span>
        <span className="truncate">{file.sourceDevice}</span>
      </div>
    </div>
  </div>
</button>
```

- [ ] **Step 5: Verify FileGrid tests pass**

```bash
npm test -- tests/components/FileGrid.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit selectable grid**

```bash
git add src/components/workspace/FileGrid.tsx tests/components/FileGrid.test.tsx
git commit -m "feat: make file grid selectable"
```

## Task 8: Detail Drawer Actions

**Files:**
- Modify: `src/components/workspace/DetailDrawer.tsx`
- Modify: `tests/components/DetailDrawer.test.tsx`

- [ ] **Step 1: Write failing action render test**

Add to `tests/components/DetailDrawer.test.tsx`:

```tsx
it("renders file action controls", () => {
  const onArchive = vi.fn();
  const onAssignProject = vi.fn();

  render(
    <DetailDrawer
      file={fixture}
      projects={[{ id: "proj_123", name: "Print Parts", slug: "print-parts", description: "", categoryId: null, status: "active", createdAt: "2026-04-30T00:00:00.000Z", updatedAt: "2026-04-30T00:00:00.000Z" }]}
      onArchive={onArchive}
      onAssignProject={onAssignProject}
    />
  );

  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/files/file_manual/download");
  expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
  expect(screen.getByLabelText("Project")).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy path" })).toBeVisible();
});
```

Add imports:

```ts
import { vi } from "vitest";
```

- [ ] **Step 2: Write failing archive click test**

```tsx
it("calls archive action for the selected file", async () => {
  const user = userEvent.setup();
  const onArchive = vi.fn();

  render(<DetailDrawer file={fixture} projects={[]} onArchive={onArchive} onAssignProject={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: "Archive" }));

  expect(onArchive).toHaveBeenCalledWith(fixture);
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- tests/components/DetailDrawer.test.tsx
```

Expected: FAIL because action props and controls are missing.

- [ ] **Step 4: Update props**

Modify `src/components/workspace/DetailDrawer.tsx`:

```ts
import type { CloudFile, Project } from "@/lib/shared/types";

type DetailDrawerProps = {
  file: CloudFile | null;
  projects?: Project[];
  isBusy?: boolean;
  onArchive?: (file: CloudFile) => void;
  onAssignProject?: (file: CloudFile, projectId: string) => void;
};
```

- [ ] **Step 5: Add selected file actions**

Inside the selected-file branch after the filename block:

```tsx
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-white"
          href={`/api/files/${encodeURIComponent(file.id)}/download`}
        >
          Download
        </a>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => onArchive?.(file)}
          disabled={isBusy}
        >
          Archive
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => void navigator.clipboard?.writeText(file.storagePath)}
        >
          Copy path
        </button>
      </div>

      <label className="mt-4 block text-sm font-semibold text-ink">
        Project
        <select
          className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={file.projectId ?? ""}
          onChange={(event) => onAssignProject?.(file, event.target.value)}
          disabled={isBusy}
        >
          <option value="">Inbox</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
```

- [ ] **Step 6: Verify drawer tests pass**

```bash
npm test -- tests/components/DetailDrawer.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit drawer actions**

```bash
git add src/components/workspace/DetailDrawer.tsx tests/components/DetailDrawer.test.tsx
git commit -m "feat: add file detail actions"
```

## Task 9: AppShell File Action Workflows

**Files:**
- Modify: `src/components/workspace/AppShell.tsx`
- Modify: `tests/components/AppShell.test.tsx`

- [ ] **Step 1: Write failing selection-to-drawer test**

Add to `tests/components/AppShell.test.tsx`:

```tsx
it("selects a file and shows its actions in the detail drawer", async () => {
  const user = userEvent.setup();
  render(<AppShell initialData={{ files: [uploadedFile], projects: [], categories: [], tags: [] }} />);

  await user.click(screen.getByRole("button", { name: "manual.pdf" }));

  expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/files/file_manual/download");
  expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
});
```

- [ ] **Step 2: Write failing archive state test**

```tsx
it("archives a selected file and removes it from the grid", async () => {
  const user = userEvent.setup();
  const archivedFile = { ...uploadedFile, status: "archived" as const, archivedAt: "2026-04-30T00:00:00.000Z" };
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify({ file: archivedFile }), { status: 200 }))
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<AppShell initialData={{ files: [uploadedFile], projects: [], categories: [], tags: [] }} />);

  await user.click(screen.getByRole("button", { name: "manual.pdf" }));
  await user.click(screen.getByRole("button", { name: "Archive" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files/file_manual/archive", { method: "POST" }));
  expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
npm test -- tests/components/AppShell.test.tsx
```

Expected: FAIL because AppShell does not select files or handle archive.

- [ ] **Step 4: Wire selection and file action state**

In `src/components/workspace/AppShell.tsx`, import helpers:

```ts
import { archiveFile, updateFileAssignment } from "@/lib/client/fileActions";
```

Add state:

```ts
const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
const [fileActionMessage, setFileActionMessage] = useState("");
const [fileActionError, setFileActionError] = useState("");
const [isFileActionBusy, setIsFileActionBusy] = useState(false);
const selectedFile = files.find((file) => file.id === selectedFileId) ?? null;
```

Add handlers:

```ts
const handleArchiveFile = async (file: CloudFile) => {
  setIsFileActionBusy(true);
  setFileActionMessage("");
  setFileActionError("");
  try {
    await archiveFile(file.id);
    setFiles((currentFiles) => currentFiles.filter((candidate) => candidate.id !== file.id));
    setSelectedFileId(null);
    setFileActionMessage(`Archived ${file.name}`);
  } catch (error) {
    setFileActionError(error instanceof Error ? error.message : "Could not archive file");
  } finally {
    setIsFileActionBusy(false);
  }
};

const handleAssignProject = async (file: CloudFile, projectId: string) => {
  setIsFileActionBusy(true);
  setFileActionMessage("");
  setFileActionError("");
  try {
    const updated = await updateFileAssignment(file.id, { projectId: projectId || null });
    setFiles((currentFiles) => currentFiles.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
    setSelectedFileId(updated.id);
    setFileActionMessage(`Updated ${updated.name}`);
  } catch (error) {
    setFileActionError(error instanceof Error ? error.message : "Could not update file");
  } finally {
    setIsFileActionBusy(false);
  }
};
```

- [ ] **Step 5: Pass props to grid and drawer**

Update `FileGrid`:

```tsx
<FileGrid files={files} selectedFileId={selectedFileId} onSelectFile={(file) => setSelectedFileId(file.id)} />
```

Update `DetailDrawer`:

```tsx
<DetailDrawer
  file={selectedFile}
  projects={initialData?.projects ?? []}
  isBusy={isFileActionBusy}
  onArchive={handleArchiveFile}
  onAssignProject={handleAssignProject}
/>
```

Add status block near the grid:

```tsx
{fileActionMessage ? (
  <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
    {fileActionMessage}
  </p>
) : null}
{fileActionError ? (
  <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
    {fileActionError}
  </p>
) : null}
```

- [ ] **Step 6: Verify AppShell tests pass**

```bash
npm test -- tests/components/AppShell.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit AppShell file workflows**

```bash
git add src/components/workspace/AppShell.tsx tests/components/AppShell.test.tsx
git commit -m "feat: wire file action workflows"
```

## Task 10: Command Bar Search Filtering

**Files:**
- Modify: `src/components/workspace/CommandBar.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Modify: `tests/components/AppShell.test.tsx`

- [ ] **Step 1: Write failing search test**

Add to `tests/components/AppShell.test.tsx`:

```tsx
it("filters visible files by search text", async () => {
  const user = userEvent.setup();
  const secondFile = {
    ...uploadedFile,
    id: "file_image",
    name: "render.png",
    extension: "png",
    family: "image" as const,
    mimeType: "image/png",
    storagePath: "Inbox/Browser/render.png"
  };

  render(<AppShell initialData={{ files: [uploadedFile, secondFile], projects: [], categories: [], tags: [] }} />);

  await user.type(screen.getByRole("searchbox", { name: "Search files" }), "render");

  expect(screen.getByRole("button", { name: "render.png" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/components/AppShell.test.tsx
```

Expected: FAIL because search is uncontrolled and not filtering.

- [ ] **Step 3: Make CommandBar controlled**

Modify `src/components/workspace/CommandBar.tsx`:

```ts
type CommandBarProps = {
  query?: string;
  onQueryChange?: (query: string) => void;
};

export function CommandBar({ query = "", onQueryChange }: CommandBarProps) {
```

Add to search input:

```tsx
value={query}
onChange={(event) => onQueryChange?.(event.target.value)}
```

- [ ] **Step 4: Filter files in AppShell**

Add state:

```ts
const [query, setQuery] = useState("");
const visibleFiles = files.filter((file) => matchesQuery(file, query));
```

Pass to command bar:

```tsx
<CommandBar query={query} onQueryChange={setQuery} />
```

Pass visible files to grid:

```tsx
<FileGrid files={visibleFiles} selectedFileId={selectedFileId} onSelectFile={(file) => setSelectedFileId(file.id)} />
```

Add helper below component:

```ts
function matchesQuery(file: CloudFile, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [file.name, file.storagePath, file.sourceDevice, file.extension, file.family]
    .some((value) => value.toLowerCase().includes(normalized));
}
```

- [ ] **Step 5: Verify search tests pass**

```bash
npm test -- tests/components/AppShell.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit search filtering**

```bash
git add src/components/workspace/CommandBar.tsx src/components/workspace/AppShell.tsx tests/components/AppShell.test.tsx
git commit -m "feat: filter workspace files"
```

## Task 11: Click-To-Upload Input

**Files:**
- Modify: `src/components/workspace/DropZone.tsx`
- Modify: `src/components/workspace/AppShell.tsx`
- Modify: `tests/components/DropZone.test.tsx`

- [ ] **Step 1: Write failing DropZone click upload test**

Update the imports in `tests/components/DropZone.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropZone } from "@/components/workspace/DropZone";
```

Add this fixture inside `describe("DropZone", () => {` before the tests:

```tsx
  const uploadedFile = {
    id: "file_upload",
    name: "manual.pdf",
    extension: "pdf",
    family: "document",
    mimeType: "application/pdf",
    sizeBytes: 5,
    checksum: "abc123",
    storagePath: "Inbox/Browser/manual.pdf",
    sourceDevice: "Browser",
    projectId: null,
    categoryId: null,
    tags: [],
    createdAt: "2026-04-30T12:00:00.000Z",
    updatedAt: "2026-04-30T12:00:00.000Z"
  };
```

Add this test after the existing drag/drop test:

```tsx
  it("uploads files selected from the hidden input", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const onUploaded = vi.fn();

    render(
      <DropZone inputId="manual-upload" onUploaded={onUploaded}>
        <label htmlFor="manual-upload">Drop files</label>
      </DropZone>
    );

    const input = screen.getByLabelText("Choose files");
    await userEvent.upload(input, new File(["hello"], "manual.pdf", { type: "application/pdf" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith([uploadedFile]));
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
  });
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- tests/components/DropZone.test.tsx
```

Expected: FAIL with a TypeScript prop error for `inputId` or a Testing Library error because no input labeled `Choose files` exists.

- [ ] **Step 3: Add hidden file input to DropZone**

Update `src/components/workspace/DropZone.tsx`:

```tsx
type DropZoneProps = {
  children: React.ReactNode;
  inputId?: string;
  onUploaded?: (files: CloudFile[]) => void;
};
```

Update the function signature:

```tsx
export function DropZone({ children, inputId, onUploaded }: DropZoneProps) {
```

Render the hidden input immediately after `{children}`:

```tsx
      {children}

      <input
        id={inputId}
        aria-label="Choose files"
        className="sr-only"
        multiple
        type="file"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          event.target.value = "";
          void uploadFiles(selectedFiles);
        }}
      />
```

- [ ] **Step 4: Wire visible upload control to the hidden input**

In `src/components/workspace/AppShell.tsx`, update the `DropZone` opening tag:

```tsx
                  <DropZone
                    inputId="workspace-file-upload"
                    onUploaded={(uploadedFiles) => setFiles((currentFiles) => [...uploadedFiles, ...currentFiles])}
                  >
```

Replace the visual upload `button` with this label:

```tsx
                      <label
                        htmlFor="workspace-file-upload"
                        className="mt-6 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
                      >
                        <UploadCloud aria-hidden="true" className="h-4 w-4" />
                        Drop files
                      </label>
```

- [ ] **Step 5: Verify component tests and types pass**

```bash
npm test -- tests/components/DropZone.test.tsx tests/components/AppShell.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit click upload**

```bash
git add src/components/workspace/DropZone.tsx src/components/workspace/AppShell.tsx tests/components/DropZone.test.tsx
git commit -m "feat: add click upload workflow"
```

## Task 12: E2E Upload And Download Smoke Test

**Files:**
- Modify: `tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Add upload and download smoke test**

Append to `tests/e2e/workspace.spec.ts`:

```ts
test("uploads selects and downloads a file", async ({ page }) => {
  await page.goto("/");

  const filename = `phase-two-smoke-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Drop files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("phase two")
  });

  await expect(page.getByRole("button", { name: filename })).toBeVisible();
  await page.getByRole("button", { name: filename }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe(filename);
});
```

- [ ] **Step 2: Run e2e to verify pass**

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 3: Commit e2e upload and download coverage**

```bash
git add tests/e2e/workspace.spec.ts
git commit -m "test: add file download smoke test"
```

## Task 13: Archive E2E Smoke

**Files:**
- Modify: `tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Add archive smoke test**

Append:

```ts
test("uploads selects and archives a file", async ({ page }) => {
  await page.goto("/");

  const filename = `archive-smoke-${Date.now()}.txt`;
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText("Drop files", { exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("archive me")
  });

  await expect(page.getByRole("button", { name: filename })).toBeVisible();
  await page.getByRole("button", { name: filename }).click();
  await page.getByRole("button", { name: "Archive" }).click();

  await expect(page.getByRole("button", { name: filename })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(`Archived ${filename}`);
});
```

- [ ] **Step 2: Run e2e**

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 3: Commit archive smoke**

```bash
git add tests/e2e/workspace.spec.ts
git commit -m "test: add file archive smoke test"
```

## Task 14: Phase 2 Documentation

**Files:**
- Create: `docs/implementation/phase-2-file-operations.md`
- Modify: `docs/implementation/mvp-summary.md`

- [ ] **Step 1: Create phase summary**

Create `docs/implementation/phase-2-file-operations.md`:

```markdown
# Phase 2 File Operations Summary

## Built

- Safe file detail endpoint
- Safe streaming download endpoint
- File archive endpoint
- Project assignment endpoint
- File lifecycle metadata
- Filesystem move/archive service operations
- Selectable file grid
- Detail drawer actions
- Client-side file search
- Click-to-upload workflow
- E2E smoke coverage for file operations

## Safety Model

- Clients never send raw filesystem paths for file operations.
- Server routes look up files by metadata ID.
- Storage service resolves all paths under `NAS_CLOUD_STORAGE_ROOT`.
- Archive is reversible at the NAS dataset level and through TrueNAS snapshots.
- Permanent delete remains outside this phase.

## Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e`
```

- [ ] **Step 2: Update MVP summary**

Append to `docs/implementation/mvp-summary.md`:

```markdown
## Phase 2 Add-On

See [Phase 2 File Operations](./phase-2-file-operations.md) for download, archive, project assignment, and file action details.
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/implementation/phase-2-file-operations.md docs/implementation/mvp-summary.md
git commit -m "docs: summarize file operations phase"
```

## Task 15: Final Verification And Review

**Files:**
- Modify only files required by verification failures.

- [ ] **Step 1: Run unit and component tests**

```bash
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Next.js production build exits 0 and `/` remains dynamic.

- [ ] **Step 4: Run e2e**

```bash
npm run test:e2e
```

Expected: all Chromium workspace smoke tests pass.

- [ ] **Step 5: Inspect git status**

```bash
git status --short --branch
```

Expected: clean branch except ignored local artifacts.

- [ ] **Step 6: Dispatch final review**

Use a final code-review subagent with:

- Base SHA: commit before Task 1 of this plan
- Head SHA: current HEAD
- Scope: production file operations
- Focus: data loss, path traversal, stale metadata, failed moves, test gaps, deployment regressions

- [ ] **Step 7: Commit final fixes**

If verification or review finds issues, fix them with tests and commit:

```bash
git add <changed-files>
git commit -m "fix: stabilize file operations"
```

If no issues are found, do not create an empty commit.

## Self-Review

Spec coverage:

- Download stored files: Tasks 3, 4, 8, 9, 11.
- Safe path handling: Tasks 3, 4, 5.
- Archive instead of delete: Tasks 1, 2, 3, 5, 8, 9, 13.
- Project assignment: Tasks 2, 3, 5, 8, 9.
- UI actions: Tasks 7, 8, 9, 10, 12.
- Search: Task 10.
- E2E workflows: Tasks 11, 12, 13.
- Documentation and verification: Tasks 14 and 15.

Known follow-up after this phase:

- Auth and access control.
- HTTP range support for large media streaming.
- Thumbnail and preview generation.
- Desktop helper for native reveal/open actions.
- Direct SMB/reindex conflict policy.
