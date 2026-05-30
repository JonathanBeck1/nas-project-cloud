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

  it("creates, lists, records, and revokes file share links", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "manual.pdf",
        extension: "pdf",
        family: "document",
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/manual.pdf",
        sourceDevice: "Browser"
      });

      const share = repo.createFileShareLink({
        fileId: file.id,
        tokenHash: "hash_123",
        createdByUserId: "user_1",
        expiresAt: "2026-05-31T00:00:00.000Z",
        maxDownloads: 3,
        label: "Send to laptop"
      });

      expect(share).toMatchObject({
        fileId: file.id,
        label: "Send to laptop",
        expiresAt: "2026-05-31T00:00:00.000Z",
        maxDownloads: 3,
        downloadCount: 0,
        revokedAt: null,
        createdByUserId: "user_1",
        lastAccessedAt: null
      });
      expect(repo.listFileShareLinks(file.id)).toEqual([share]);
      expect(repo.getFileShareLinkByTokenHash("hash_123")?.id).toBe(share.id);

      const accessed = repo.recordFileShareDownload(share.id);
      expect(accessed?.downloadCount).toBe(1);
      expect(accessed?.lastAccessedAt).toEqual(expect.any(String));

      const revoked = repo.revokeFileShareLink(file.id, share.id);
      expect(revoked?.revokedAt).toEqual(expect.any(String));
      expect(repo.revokeFileShareLink(file.id, "missing")).toBeNull();
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

  it("creates tags and assigns them to files", () => {
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

      const tag = repo.createTag({ name: "Printer" });
      const updated = repo.setFileTags(file.id, [tag.id]);

      expect(updated?.tags).toEqual([tag]);
      expect(repo.listTags()).toEqual([tag]);
    } finally {
      db.close();
    }
  });

  it("creates, updates, and deletes custom categories while protecting system ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);

      const custom = repo.createCategory({ name: "Reference", color: "#0F62FE" });
      expect(custom.isSystem).toBe(false);
      expect(custom.slug).toBe("reference");
      expect(repo.getCategoryBySlug("reference")?.id).toBe(custom.id);

      const renamed = repo.updateCategory(custom.id, { name: "References", color: "#42BE65" });
      expect(renamed?.name).toBe("References");
      expect(renamed?.color).toBe("#42BE65");

      const systemCategory = repo.listCategories().find((category) => category.isSystem);
      expect(systemCategory).toBeDefined();
      expect(() => repo.updateCategory(systemCategory!.id, { name: "Renamed" })).toThrow();
      expect(() => repo.deleteCategory(systemCategory!.id)).toThrow();

      expect(repo.deleteCategory(custom.id)).toBe(true);
      expect(repo.getCategoryById(custom.id)).toBeNull();
      expect(repo.deleteCategory(custom.id)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("updates project name, description, status, and category", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Garage Build" });

      const renamed = repo.updateProject(project.id, {
        name: "Garage Build v2",
        description: "Phase 2",
        status: "complete",
        categoryId: "cat_cad"
      });

      expect(renamed?.name).toBe("Garage Build v2");
      expect(renamed?.description).toBe("Phase 2");
      expect(renamed?.status).toBe("complete");
      expect(renamed?.categoryId).toBe("cat_cad");
      expect(renamed?.slug).toBe(project.slug);
      expect(repo.updateProject("missing", { name: "x" })).toBeNull();
    } finally {
      db.close();
    }
  });

  it("detaches files from a project on delete instead of removing them", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Garage Build" });
      const file = repo.createFile({
        name: "drill.jpg",
        extension: "jpg",
        family: "image",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Projects/garage-build/Inbox/drill.jpg",
        sourceDevice: "Browser",
        projectId: project.id
      });

      const result = repo.deleteProject(project.id);

      expect(result).toEqual({ removed: true, detachedFiles: 1 });
      expect(repo.getProjectById(project.id)).toBeNull();
      expect(repo.getFileById(file.id)?.projectId).toBeNull();
      expect(repo.deleteProject(project.id)).toEqual({ removed: false, detachedFiles: 0 });
    } finally {
      db.close();
    }
  });

  it("clears category_id on files when a custom category is deleted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const category = repo.createCategory({ name: "Workshop", color: "#FF6F00" });
      const file = repo.createFile({
        name: "drill.jpg",
        extension: "jpg",
        family: "image",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/drill.jpg",
        sourceDevice: "Browser",
        categoryId: category.id
      });

      expect(repo.getFileById(file.id)?.categoryId).toBe(category.id);
      expect(repo.deleteCategory(category.id)).toBe(true);
      expect(repo.getFileById(file.id)?.categoryId).toBeNull();
    } finally {
      db.close();
    }
  });

  it("looks up tags by slug and deletes them, cascading file_tags", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "render.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/render.png",
        sourceDevice: "Browser"
      });
      const tag = repo.createTag({ name: "Reference" });
      repo.setFileTags(file.id, [tag.id]);

      expect(repo.getTagBySlug("reference")?.id).toBe(tag.id);
      expect(repo.getFileById(file.id)?.tags).toEqual([tag]);

      expect(repo.deleteTag(tag.id)).toBe(true);
      expect(repo.listTags()).toEqual([]);
      expect(repo.getFileById(file.id)?.tags).toEqual([]);
      expect(repo.deleteTag(tag.id)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("bulk updates file project and category metadata", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Garage Build" });
      const first = repo.createFile({
        name: "bracket.stl",
        extension: "stl",
        family: "cad",
        mimeType: "model/stl",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/bracket.stl",
        sourceDevice: "Browser"
      });
      const second = repo.createFile({
        name: "fixture.3mf",
        extension: "3mf",
        family: "cad",
        mimeType: "model/3mf",
        sizeBytes: 10,
        checksum: "def",
        storagePath: "Inbox/Browser/fixture.3mf",
        sourceDevice: "Browser"
      });

      const updated = repo.bulkUpdateFiles({
        fileIds: [first.id, second.id],
        projectId: project.id,
        categoryId: "cat_cad"
      });

      expect(updated.map((file) => file.id).sort()).toEqual([first.id, second.id].sort());
      expect(updated.every((file) => file.projectId === project.id)).toBe(true);
      expect(updated.every((file) => file.categoryId === "cat_cad")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("upserts file previews and lists pending preview jobs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "render.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/render.png",
        sourceDevice: "Browser"
      });

      const pending = repo.upsertFilePreview({
        fileId: file.id,
        kind: "image",
        status: "pending"
      });

      expect(repo.getFilePreview(file.id, "image")).toEqual(pending);
      expect(repo.listPendingPreviewJobs()).toEqual([{ file, preview: pending }]);

      const ready = repo.upsertFilePreview({
        fileId: file.id,
        kind: "image",
        status: "ready",
        previewPath: ".previews/images/render.webp",
        width: 320,
        height: 180
      });

      expect(ready).toMatchObject({
        fileId: file.id,
        kind: "image",
        status: "ready",
        previewPath: ".previews/images/render.webp",
        width: 320,
        height: 180,
        error: null
      });
      expect(repo.listPendingPreviewJobs()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("hydrates ready preview metadata on files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const file = repo.createFile({
        name: "render.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "abc",
        storagePath: "Inbox/Browser/render.png",
        sourceDevice: "Browser"
      });
      const preview = repo.upsertFilePreview({
        fileId: file.id,
        kind: "image",
        status: "ready",
        previewPath: ".previews/images/render.webp",
        width: 320,
        height: 180
      });

      expect(repo.getFileById(file.id)?.preview).toEqual(preview);
      expect(repo.listFiles()[0].preview).toEqual(preview);
    } finally {
      db.close();
    }
  });

  it("counts file previews by status, tracks last successful preview, and resets failed rows", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);

      expect(repo.countFilePreviewsByStatus()).toEqual({
        pending: 0,
        ready: 0,
        failed: 0,
        skipped: 0,
        unsupported: 0
      });
      expect(repo.lastSuccessfulPreviewAt()).toBeNull();
      expect(repo.resetFailedPreviews()).toBe(0);

      const fileA = repo.createFile({
        name: "a.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 10,
        checksum: "a",
        storagePath: "Inbox/Browser/a.png",
        sourceDevice: "Browser"
      });
      const fileB = repo.createFile({
        name: "b.png",
        extension: "png",
        family: "image",
        mimeType: "image/png",
        sizeBytes: 11,
        checksum: "b",
        storagePath: "Inbox/Browser/b.png",
        sourceDevice: "Browser"
      });
      const fileC = repo.createFile({
        name: "c.mov",
        extension: "mov",
        family: "video",
        mimeType: "video/quicktime",
        sizeBytes: 12,
        checksum: "c",
        storagePath: "Inbox/Browser/c.mov",
        sourceDevice: "Browser"
      });
      const fileD = repo.createFile({
        name: "d.docx",
        extension: "docx",
        family: "document",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 13,
        checksum: "d",
        storagePath: "Inbox/Browser/d.docx",
        sourceDevice: "Browser"
      });

      repo.upsertFilePreview({ fileId: fileA.id, kind: "image", status: "pending" });
      const ready = repo.upsertFilePreview({
        fileId: fileB.id,
        kind: "image",
        status: "ready",
        previewPath: ".previews/images/b.webp",
        width: 320,
        height: 180
      }) as { updatedAt: string };
      repo.upsertFilePreview({ fileId: fileC.id, kind: "video", status: "failed", error: "ffmpeg crash" });
      repo.upsertFilePreview({ fileId: fileD.id, kind: "document", status: "skipped" });

      expect(repo.countFilePreviewsByStatus()).toEqual({
        pending: 1,
        ready: 1,
        failed: 1,
        skipped: 1,
        unsupported: 0
      });
      expect(repo.lastSuccessfulPreviewAt()).toBe(ready.updatedAt);

      const reset = repo.resetFailedPreviews();
      expect(reset).toBe(1);
      expect(repo.countFilePreviewsByStatus()).toEqual({
        pending: 2,
        ready: 1,
        failed: 0,
        skipped: 1,
        unsupported: 0
      });

      const requeued = repo.getFilePreview(fileC.id, "video");
      expect(requeued?.status).toBe("pending");
      expect(requeued?.error).toBeNull();
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

  it("creates, advances, completes, and fails upload sessions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const project = repo.createProject({ name: "Garage Build" });
      const session = repo.createUploadSession({
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 12,
        checksum: "sha256-movie",
        userId: "user_1",
        deviceId: "device_1",
        targetKind: "project",
        sourceDevice: "Mac Studio",
        projectId: project.id,
        projectSlug: project.slug,
        categoryId: "cat_media",
        tempPath: ".uploads/upload_123.part"
      });

      expect(session).toMatchObject({
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 12,
        receivedBytes: 0,
        checksum: "sha256-movie",
        userId: "user_1",
        deviceId: "device_1",
        targetKind: "project",
        sourceDevice: "Mac Studio",
        projectId: project.id,
        projectSlug: project.slug,
        categoryId: "cat_media",
        status: "open",
        tempPath: ".uploads/upload_123.part",
        storagePath: null,
        error: null,
        completedAt: null
      });

      expect(repo.getUploadSession(session.id)?.id).toBe(session.id);

      const advanced = repo.advanceUploadSession(session.id, {
        expectedReceivedBytes: 0,
        receivedBytes: 7
      });
      expect(advanced?.receivedBytes).toBe(7);

      expect(
        repo.advanceUploadSession(session.id, {
          expectedReceivedBytes: 0,
          receivedBytes: 9
        })
      ).toBeNull();

      const completed = repo.completeUploadSession(session.id, {
        storagePath: "Projects/garage-build/Inbox/movie.webm"
      });
      expect(completed?.status).toBe("completed");
      expect(completed?.storagePath).toBe("Projects/garage-build/Inbox/movie.webm");
      expect(completed?.completedAt).toEqual(expect.any(String));

      const failed = repo.failUploadSession(session.id, "metadata create failed");
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("metadata create failed");
    } finally {
      db.close();
    }
  });

  it("filters open upload sessions by user and device", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const matching = repo.createUploadSession({
        filename: "render.png",
        mimeType: "image/png",
        sizeBytes: 12,
        userId: "user_1",
        deviceId: "device_1",
        targetKind: "inbox",
        sourceDevice: "Mac Studio",
        tempPath: ".uploads/upload_match.part"
      });
      repo.createUploadSession({
        filename: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        userId: "user_1",
        deviceId: "device_2",
        targetKind: "inbox",
        sourceDevice: "Windows PC",
        tempPath: ".uploads/upload_other_device.part"
      });
      repo.createUploadSession({
        filename: "other.mov",
        mimeType: "video/quicktime",
        sizeBytes: 8,
        userId: "user_2",
        deviceId: null,
        targetKind: "inbox",
        sourceDevice: "Guest",
        tempPath: ".uploads/upload_other_user.part"
      });

      expect(repo.listOpenUploadSessions({ userId: "user_1", deviceId: "device_1" })).toEqual([matching]);
      expect(repo.listOpenUploadSessions({ userId: "user_1" }).map((session) => session.id)).toEqual(
        expect.arrayContaining([matching.id])
      );
      expect(repo.listOpenUploadSessions({ userId: "user_1" })).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it("creates users, devices, sessions, and pairing codes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const user = repo.createUser({
        email: "owner@example.local",
        name: "Owner",
        passwordHash: "scrypt:salt:hash",
        role: "owner"
      });

      const device = repo.createDevice({
        userId: user.id,
        name: "Mac Studio",
        kind: "browser"
      });

      const session = repo.createSession({
        userId: user.id,
        deviceId: device.id,
        tokenHash: "token-hash",
        expiresAt: "2026-06-01T00:00:00.000Z"
      });

      const pairing = repo.createDevicePairingCode({
        userId: user.id,
        codeHash: "pairing-hash",
        deviceName: "Windows PC",
        deviceKind: "browser",
        expiresAt: "2026-05-02T12:00:00.000Z"
      });

      expect(repo.countUsers()).toBe(1);
      expect(repo.getUserByEmail("owner@example.local")?.id).toBe(user.id);
      expect(repo.getSessionByTokenHash("token-hash")?.id).toBe(session.id);
      expect(repo.listDevices(user.id).map((entry) => entry.id)).toEqual([device.id]);
      expect(repo.getDevicePairingCodeByHash("pairing-hash")?.id).toBe(pairing.id);

      const consumed = repo.consumeDevicePairingCode(pairing.id);
      expect(consumed?.consumedAt).toEqual(expect.any(String));

      repo.deleteSession(session.id);
      expect(repo.getSessionByTokenHash("token-hash")).toBeNull();
    } finally {
      db.close();
    }
  });

  it("revokes a device and removes its sessions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-metadata-"));
    createdDirs.push(dir);
    const db = createDatabase(path.join(dir, "test.sqlite"));
    try {
      const repo = createMetadataRepository(db);
      const user = repo.createUser({
        email: "owner@example.local",
        name: "Owner",
        passwordHash: "scrypt:salt:hash",
        role: "owner"
      });
      const device = repo.createDevice({
        userId: user.id,
        name: "Windows PC",
        kind: "desktop"
      });
      const session = repo.createSession({
        userId: user.id,
        deviceId: device.id,
        tokenHash: "session-hash",
        expiresAt: "2026-06-01T00:00:00.000Z"
      });

      expect(repo.revokeDevice(user.id, device.id)).toBe(true);
      expect(repo.listDevices(user.id)).toEqual([]);
      expect(repo.getSessionByTokenHash(session.tokenHash)).toBeNull();
      expect(repo.revokeDevice(user.id, device.id)).toBe(false);
    } finally {
      db.close();
    }
  });
});
