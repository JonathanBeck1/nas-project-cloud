import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileFamily } from "@/lib/shared/types";

const mocks = vi.hoisted(() => {
  const repo = {
    bulkUpdateFiles: vi.fn(),
    listFiles: vi.fn(),
    createFile: vi.fn(),
    getFileById: vi.fn(),
    getProjectById: vi.fn(),
    deleteFile: vi.fn(),
    listCategories: vi.fn(),
    setFileTags: vi.fn(),
    updateFile: vi.fn(),
    upsertFilePreview: vi.fn()
  };
  const storage = {
    writeUpload: vi.fn(),
    absolutePathFor: vi.fn(),
    moveToProject: vi.fn(),
    archiveFile: vi.fn(),
    restoreFile: vi.fn(),
    deleteFile: vi.fn()
  };

  return {
    appConfig: {
      maxUploadBytes: 10,
      storageRoot: ""
    },
    db: {},
    repo,
    storage,
    classifyFile: vi.fn()
  };
});

const createdDirs: string[] = [];

vi.mock("@/lib/server/config", () => ({
  appConfig: mocks.appConfig
}));

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => mocks.db)
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, userId: "user_1", sessionId: "session_1", deviceId: "device_1" }))
}));

vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: vi.fn(() => mocks.repo)
}));

vi.mock("@/lib/server/storage", () => ({
  createStorageService: vi.fn(() => mocks.storage)
}));

vi.mock("@/lib/shared/fileTypes", () => ({
  classifyFile: mocks.classifyFile
}));

describe("files API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appConfig.maxUploadBytes = 10;
    mocks.appConfig.storageRoot = os.tmpdir();
    mocks.repo.bulkUpdateFiles.mockReturnValue([]);
    mocks.repo.listFiles.mockReturnValue([]);
    mocks.repo.getFileById.mockReturnValue(null);
    mocks.repo.getProjectById.mockReturnValue(null);
    mocks.repo.deleteFile.mockReturnValue(false);
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
    mocks.repo.setFileTags.mockReturnValue(null);
    mocks.repo.upsertFilePreview.mockReturnValue({
      fileId: "file_1",
      kind: "image",
      status: "pending",
      previewPath: null,
      width: null,
      height: null,
      durationSeconds: null,
      error: null,
      createdAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z"
    });
    mocks.repo.createFile.mockImplementation((input) => ({
      id: "file_1",
      uploadedAt: "2026-04-30T00:00:00.000Z",
      updatedAt: "2026-04-30T00:00:00.000Z",
      tags: [],
      ...input
    }));
    mocks.repo.updateFile.mockReturnValue(null);
    mocks.storage.writeUpload.mockResolvedValue({
      absolutePath: "/storage/Inbox/Mac/part.stl",
      relativePath: "Inbox/Mac/part.stl",
      sizeBytes: 5,
      checksum: "checksum",
      mimeType: "model/stl"
    });
    mocks.storage.absolutePathFor.mockImplementation((relativePath: string) =>
      path.join(mocks.appConfig.storageRoot, relativePath)
    );
    mocks.storage.moveToProject.mockResolvedValue({
      absolutePath: "/storage/Projects/project/Inbox/part.stl",
      relativePath: "Projects/project/Inbox/part.stl"
    });
    mocks.storage.archiveFile.mockResolvedValue({
      absolutePath: "/storage/Archive/2026/04/part.stl",
      relativePath: "Archive/2026/04/part.stl"
    });
    mocks.storage.restoreFile.mockResolvedValue({
      absolutePath: "/storage/Inbox/Browser/part.stl",
      relativePath: "Inbox/Browser/part.stl"
    });
    mocks.storage.deleteFile.mockResolvedValue(undefined);
    mocks.classifyFile.mockReturnValue({
      extension: "stl",
      family: "cad" as FileFamily
    });
  });

  afterEach(() => {
    while (createdDirs.length > 0) {
      fs.rmSync(createdDirs.pop()!, { force: true, recursive: true });
    }
  });

  it("passes GET filters to the repository", async () => {
    const { GET } = await import("@/app/api/files/route");
    const files = [{ id: "file_1" }];
    mocks.repo.listFiles.mockReturnValue(files);

    const response = await GET(
      new Request("http://localhost/api/files?query=bracket&projectId=proj_1&categoryId=cat_1")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ files });
    expect(mocks.repo.listFiles).toHaveBeenCalledWith({
      query: "bracket",
      projectId: "proj_1",
      categoryId: "cat_1"
    });
  });

  it("enqueues image previews when a direct upload creates image metadata", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.appConfig.maxUploadBytes = 1024;
    mocks.classifyFile.mockReturnValue({
      extension: "png",
      family: "image" as FileFamily
    });
    mocks.storage.writeUpload.mockResolvedValue({
      absolutePath: "/storage/Inbox/Mac/render.png",
      relativePath: "Inbox/Mac/render.png",
      sizeBytes: 5,
      checksum: "checksum",
      mimeType: "image/png"
    });

    const bytes = Buffer.from("image");
    const file = new File(["image"], "render.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    });

    const response = await POST(formRequest({ file, sourceDevice: "Mac" }));

    expect(response.status).toBe(201);
    expect(mocks.repo.upsertFilePreview).toHaveBeenCalledWith({
      fileId: "file_1",
      kind: "image",
      status: "pending"
    });
  });

  it("returns file detail by id", async () => {
    const { GET } = await import("@/app/api/files/[id]/route");
    const file = {
      id: "file_123",
      name: "manual.pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    };
    mocks.repo.getFileById.mockReturnValue(file);

    const response = await GET(new Request("http://localhost/api/files/file_123"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ file });
  });

  it("returns 404 for archived file detail", async () => {
    const { GET } = await import("@/app/api/files/[id]/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "archived",
      storagePath: "Archive/2026/04/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
  });

  it("moves a file into a project on patch", async () => {
    const { PATCH: fileDetailPatch } = await import("@/app/api/files/[id]/route");
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
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_123",
      {
        projectId: "proj_123",
        categoryId: "cat_cad",
        storagePath: "Projects/print-parts/Inbox/bracket.stl"
      },
      {
        storagePath: "Inbox/Browser/bracket.stl",
        status: "active"
      }
    );
  });

  it("rolls back a project move when metadata update fails", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
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
    mocks.repo.updateFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "proj_123" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file metadata update failed" });
    expect(mocks.storage.restoreFile).toHaveBeenCalledWith({
      currentRelativePath: "Projects/print-parts/Inbox/bracket.stl",
      targetRelativePath: "Inbox/Browser/bracket.stl"
    });
  });

  it("updates file category and tags", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
    const updated = {
      id: "file_123",
      categoryId: "cat_cad",
      tags: [{ id: "tag_1", name: "Printer", slug: "printer" }]
    };
    mocks.repo.getFileById.mockReturnValue({ id: "file_123", status: "active", storagePath: "Inbox/Browser/bracket.stl" });
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
    mocks.repo.updateFile.mockReturnValue({ id: "file_123", categoryId: "cat_cad" });
    mocks.repo.setFileTags.mockReturnValue(updated);

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ categoryId: "cat_cad", tagIds: ["tag_1"] })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ file: updated });
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_123",
      { categoryId: "cat_cad" },
      { storagePath: "Inbox/Browser/bracket.stl", status: "active" }
    );
    expect(mocks.repo.setFileTags).toHaveBeenCalledWith("file_123", ["tag_1"]);
  });

  it("bulk assigns files to a project and category", async () => {
    const { POST } = await import("@/app/api/files/bulk/route");
    mocks.repo.getProjectById.mockReturnValue({ id: "proj_1", slug: "garage-build", name: "Garage Build" });
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
    mocks.repo.bulkUpdateFiles.mockReturnValue([
      { id: "file_1", projectId: "proj_1", categoryId: "cat_cad" },
      { id: "file_2", projectId: "proj_1", categoryId: "cat_cad" }
    ]);

    const response = await POST(
      new Request("http://localhost/api/files/bulk", {
        method: "POST",
        body: JSON.stringify({
          fileIds: ["file_1", "file_2"],
          projectId: "proj_1",
          categoryId: "cat_cad"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      files: [
        { id: "file_1", projectId: "proj_1", categoryId: "cat_cad" },
        { id: "file_2", projectId: "proj_1", categoryId: "cat_cad" }
      ]
    });
  });

  it("reports repair required when project move rollback fails", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
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
    mocks.repo.updateFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    mocks.storage.restoreFile.mockRejectedValue(new Error("restore failed"));

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "proj_123" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file operation requires manual repair" });
  });

  it("rolls back a project move when metadata update misses the row", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
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
    mocks.repo.updateFile.mockReturnValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "proj_123" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.storage.restoreFile).toHaveBeenCalledWith({
      currentRelativePath: "Projects/print-parts/Inbox/bracket.stl",
      targetRelativePath: "Inbox/Browser/bracket.stl"
    });
  });

  it("returns 400 when patch body is invalid JSON", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: "{"
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid file update" });
    expect(mocks.repo.getFileById).not.toHaveBeenCalled();
  });

  it("returns 400 when patch body has an invalid schema", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: 123 })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid file update" });
    expect(mocks.repo.getFileById).not.toHaveBeenCalled();
  });

  it("returns 400 when patch projectId is empty", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid file update" });
    expect(mocks.storage.moveToProject).not.toHaveBeenCalled();
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it.each([["empty", {}], ["unknown", { bogus: true }]])(
    "returns 400 when patch body is %s",
    async (_label, body) => {
      const { PATCH } = await import("@/app/api/files/[id]/route");

      const response = await PATCH(
        new Request("http://localhost/api/files/file_123", {
          method: "PATCH",
          body: JSON.stringify(body)
        }),
        { params: Promise.resolve({ id: "file_123" }) }
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "invalid file update" });
      expect(mocks.repo.getFileById).not.toHaveBeenCalled();
      expect(mocks.storage.moveToProject).not.toHaveBeenCalled();
      expect(mocks.repo.updateFile).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["missing", null],
    [
      "archived",
      {
        id: "file_123",
        name: "manual.pdf",
        status: "archived",
        storagePath: "Inbox/Browser/manual.pdf"
      }
    ]
  ])("returns 404 when patching a %s file", async (_label, file) => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
    mocks.repo.getFileById.mockReturnValue(file);

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ categoryId: "cat_1" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it("returns 404 before moving storage when patch category is missing", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "bracket.stl",
      status: "active",
      storagePath: "Inbox/Browser/bracket.stl"
    });
    mocks.repo.getProjectById.mockReturnValue({
      id: "proj_123",
      slug: "print-parts",
      name: "Print Parts"
    });
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_missing" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "category not found" });
    expect(mocks.storage.moveToProject).not.toHaveBeenCalled();
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it("returns 404 when moving a file to a missing project", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "bracket.stl",
      status: "active",
      storagePath: "Inbox/Browser/bracket.stl"
    });
    mocks.repo.getProjectById.mockReturnValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: "proj_missing" })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "project not found" });
    expect(mocks.storage.moveToProject).not.toHaveBeenCalled();
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it("does not move storage when clearing a file project on patch", async () => {
    const { PATCH } = await import("@/app/api/files/[id]/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "bracket.stl",
      projectId: "proj_123",
      status: "active",
      storagePath: "Projects/print-parts/Inbox/bracket.stl"
    });
    mocks.repo.updateFile.mockReturnValue({
      id: "file_123",
      name: "bracket.stl",
      projectId: null,
      storagePath: "Projects/print-parts/Inbox/bracket.stl"
    });

    const response = await PATCH(
      new Request("http://localhost/api/files/file_123", {
        method: "PATCH",
        body: JSON.stringify({ projectId: null })
      }),
      { params: Promise.resolve({ id: "file_123" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.storage.moveToProject).not.toHaveBeenCalled();
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_123",
      { projectId: null },
      { storagePath: "Projects/print-parts/Inbox/bracket.stl", status: "active" }
    );
  });

  it("archives a file by moving storage and updating metadata", async () => {
    const { POST: fileArchivePost } = await import("@/app/api/files/[id]/archive/route");
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

    const response = await fileArchivePost(
      new Request("http://localhost/api/files/file_123/archive", { method: "POST" }),
      {
        params: Promise.resolve({ id: "file_123" })
      }
    );

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
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_123",
      expect.objectContaining({
        storagePath: "Archive/2026/04/manual.pdf",
        status: "archived",
        archivedAt: expect.any(String)
      }),
      {
        storagePath: "Inbox/Browser/manual.pdf",
        status: "active"
      }
    );
  });

  it("rolls back an archive move when metadata update fails", async () => {
    const { POST } = await import("@/app/api/files/[id]/archive/route");
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
    mocks.repo.updateFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await POST(new Request("http://localhost/api/files/file_123/archive", { method: "POST" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file metadata update failed" });
    expect(mocks.storage.restoreFile).toHaveBeenCalledWith({
      currentRelativePath: "Archive/2026/04/manual.pdf",
      targetRelativePath: "Inbox/Browser/manual.pdf"
    });
  });

  it("reports repair required when archive rollback fails", async () => {
    const { POST } = await import("@/app/api/files/[id]/archive/route");
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
    mocks.repo.updateFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    mocks.storage.restoreFile.mockRejectedValue(new Error("restore failed"));

    const response = await POST(new Request("http://localhost/api/files/file_123/archive", { method: "POST" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file operation requires manual repair" });
  });

  it("rolls back an archive move when metadata update misses the row", async () => {
    const { POST } = await import("@/app/api/files/[id]/archive/route");
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
    mocks.repo.updateFile.mockReturnValue(null);

    const response = await POST(new Request("http://localhost/api/files/file_123/archive", { method: "POST" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.storage.restoreFile).toHaveBeenCalledWith({
      currentRelativePath: "Archive/2026/04/manual.pdf",
      targetRelativePath: "Inbox/Browser/manual.pdf"
    });
  });

  it.each([
    ["missing", null],
    [
      "archived",
      {
        id: "file_123",
        name: "manual.pdf",
        status: "archived",
        storagePath: "Inbox/Browser/manual.pdf"
      }
    ]
  ])("returns 404 when archiving a %s file", async (_label, file) => {
    const { POST } = await import("@/app/api/files/[id]/archive/route");
    mocks.repo.getFileById.mockReturnValue(file);

    const response = await POST(new Request("http://localhost/api/files/file_123/archive"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.storage.archiveFile).not.toHaveBeenCalled();
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it("returns 404 and skips metadata update when archive storage move fails", async () => {
    const { POST } = await import("@/app/api/files/[id]/archive/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });
    mocks.storage.archiveFile.mockRejectedValue(new Error("missing"));

    const response = await POST(new Request("http://localhost/api/files/file_123/archive"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.repo.updateFile).not.toHaveBeenCalled();
  });

  it("restores an archived file into the restored inbox", async () => {
    const { POST } = await import("@/app/api/files/[id]/restore/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "archived",
      archivedAt: "2026-04-30T00:00:00.000Z",
      storagePath: "Archive/2026/04/manual.pdf"
    });
    mocks.storage.restoreFile.mockResolvedValue({
      absolutePath: "/tmp/Inbox/Restored/file_123-manual.pdf",
      relativePath: "Inbox/Restored/file_123-manual.pdf"
    });
    mocks.repo.updateFile.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "active",
      archivedAt: null,
      projectId: null,
      storagePath: "Inbox/Restored/file_123-manual.pdf"
    });

    const response = await POST(new Request("http://localhost/api/files/file_123/restore", { method: "POST" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      file: {
        id: "file_123",
        status: "active",
        archivedAt: null,
        storagePath: "Inbox/Restored/file_123-manual.pdf"
      }
    });
    expect(mocks.storage.restoreFile).toHaveBeenCalledWith({
      currentRelativePath: "Archive/2026/04/manual.pdf",
      targetRelativePath: "Inbox/Restored/file_123-manual.pdf"
    });
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_123",
      {
        storagePath: "Inbox/Restored/file_123-manual.pdf",
        status: "active",
        archivedAt: null,
        projectId: null
      },
      {
        storagePath: "Archive/2026/04/manual.pdf",
        status: "archived"
      }
    );
  });

  it("permanently deletes archived file storage and metadata", async () => {
    const { DELETE } = await import("@/app/api/files/[id]/delete/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "archived",
      storagePath: "Archive/2026/04/manual.pdf"
    });
    mocks.repo.deleteFile.mockReturnValue(true);

    const response = await DELETE(new Request("http://localhost/api/files/file_123/delete", { method: "DELETE" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith("Archive/2026/04/manual.pdf");
    expect(mocks.repo.deleteFile).toHaveBeenCalledWith("file_123");
  });

  it("refuses to permanently delete active files", async () => {
    const { DELETE } = await import("@/app/api/files/[id]/delete/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await DELETE(new Request("http://localhost/api/files/file_123/delete", { method: "DELETE" }), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled();
    expect(mocks.repo.deleteFile).not.toHaveBeenCalled();
  });

  it("streams a file download with safe headers", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain('filename="manual.pdf"');
    expect(mocks.storage.absolutePathFor).toHaveBeenCalledWith("Inbox/Browser/manual.pdf");
    await expect(response.text()).resolves.toBe("manual");
  });

  it("streams a ready file preview", async () => {
    const { GET } = await import("@/app/api/files/[id]/preview/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, ".previews", "images"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".previews", "images", "file_123.webp"), "preview");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "render.png",
      mimeType: "image/png",
      status: "active",
      storagePath: "Inbox/Browser/render.png",
      preview: {
        fileId: "file_123",
        kind: "image",
        status: "ready",
        previewPath: ".previews/images/file_123.webp"
      }
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/preview"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    await expect(response.text()).resolves.toBe("preview");
  });

  it("returns 404 for missing file previews", async () => {
    const { GET } = await import("@/app/api/files/[id]/preview/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "render.png",
      status: "active",
      storagePath: "Inbox/Browser/render.png",
      preview: null
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/preview"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "preview not found" });
  });

  it("sanitizes unsafe download filenames without throwing", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: 'bad"\\\r\n\u0001.pdf',
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain('filename="bad_____.pdf"');
    expect(mocks.storage.absolutePathFor).toHaveBeenCalledWith("Inbox/Browser/manual.pdf");
    await expect(response.text()).resolves.toBe("manual");
  });

  it("uses basename for path-like download filenames", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "../manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain('filename="manual.pdf"');
    await expect(response.text()).resolves.toBe("manual");
  });

  it("keeps unicode download filenames header-safe", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Inbox", "Browser", "render.png"), "image");
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "render🚀.png",
      mimeType: "image/png",
      status: "active",
      storagePath: "Inbox/Browser/render.png"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });
    const contentDisposition = response.headers.get("content-disposition") ?? "";

    expect(response.status).toBe(200);
    expect(contentDisposition).toContain('filename="render__.png"');
    expect(contentDisposition).toContain("filename*=UTF-8''render%F0%9F%9A%80.png");
    expect([...contentDisposition].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
    await expect(response.text()).resolves.toBe("image");
  });

  it.each(["", "   ", "text/plain\r\nx-bad: y", "text/plain; charset=utf-8", "text/plain,image/png"])(
    "falls back to octet-stream for invalid MIME metadata %#",
    async (mimeType) => {
      const { GET } = await import("@/app/api/files/[id]/download/route");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
      createdDirs.push(dir);
      fs.mkdirSync(path.join(dir, "Inbox", "Browser"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Inbox", "Browser", "manual.pdf"), "manual");
      mocks.appConfig.storageRoot = dir;
      mocks.repo.getFileById.mockReturnValue({
        id: "file_123",
        name: "manual.pdf",
        mimeType,
        status: "active",
        storagePath: "Inbox/Browser/manual.pdf"
      });

      const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
        params: Promise.resolve({ id: "file_123" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/octet-stream");
      await expect(response.text()).resolves.toBe("manual");
    }
  );

  it("returns 404 when downloading an archived file", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "archived",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
  });

  it("returns 404 when the download file is missing on disk", async () => {
    const { GET } = await import("@/app/api/files/[id]/download/route");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-api-"));
    createdDirs.push(dir);
    mocks.appConfig.storageRoot = dir;
    mocks.repo.getFileById.mockReturnValue({
      id: "file_123",
      name: "manual.pdf",
      mimeType: "application/pdf",
      status: "active",
      storagePath: "Inbox/Browser/manual.pdf"
    });

    const response = await GET(new Request("http://localhost/api/files/file_123/download"), {
      params: Promise.resolve({ id: "file_123" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "file not found" });
  });

  it("returns 400 when POST is missing a file", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(formRequest({ sourceDevice: "Mac" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "file is required" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("rejects oversized Content-Length before parsing the body", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      new Request("http://localhost/api/files", {
        method: "POST",
        headers: {
          "content-length": "11",
          "content-type": "multipart/form-data; boundary=broken"
        },
        body: "this is not valid multipart data"
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "file exceeds upload size limit" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("returns 400 when form data cannot be parsed", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      new Request("http://localhost/api/files", {
        method: "POST",
        headers: {
          "content-length": "9",
          "content-type": "multipart/form-data; boundary=broken"
        },
        body: "not-valid"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid form data" });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("stores inbox uploads under the source device and records inbox metadata", async () => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        categoryId: "cat_cad"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.storage.writeUpload).toHaveBeenCalledWith({
      target: { kind: "inbox", sourceDevice: "Mac" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("hello")
    });
    expect(mocks.repo.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "part.stl",
        projectId: null,
        categoryId: "cat_cad",
        sourceDevice: "Mac",
        storagePath: "Inbox/Mac/part.stl"
      })
    );
  });

  it("stores project uploads under projectSlug and records projectId metadata", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.getProjectById.mockReturnValue({
      id: "proj_1",
      slug: "garage-build",
      name: "Garage Build"
    });
    mocks.storage.writeUpload.mockResolvedValue({
      absolutePath: "/storage/Projects/garage-build/Inbox/part.stl",
      relativePath: "Projects/garage-build/Inbox/part.stl",
      sizeBytes: 5,
      checksum: "checksum",
      mimeType: "model/stl"
    });

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        projectId: "proj_1",
        projectSlug: "garage-build"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.storage.writeUpload).toHaveBeenCalledWith({
      target: { kind: "project", projectSlug: "garage-build" },
      filename: "part.stl",
      mimeType: "model/stl",
      bytes: Buffer.from("hello")
    });
    expect(mocks.repo.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        sourceDevice: "Mac",
        storagePath: "Projects/garage-build/Inbox/part.stl"
      })
    );
  });

  it("rejects project uploads for a missing project before writing storage", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.getProjectById.mockReturnValue(null);
    const file = uploadFile("hello");

    const response = await POST(
      formRequest({
        file,
        sourceDevice: "Mac",
        projectId: "proj_missing",
        projectSlug: "garage-build"
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "project not found" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("rejects mismatched project upload slugs before writing storage", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.getProjectById.mockReturnValue({
      id: "proj_1",
      slug: "real-project",
      name: "Real Project"
    });
    const file = uploadFile("hello");

    const response = await POST(
      formRequest({
        file,
        sourceDevice: "Mac",
        projectId: "proj_1",
        projectSlug: "wrong-project"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "project slug mismatch" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("rejects uploads for missing categories before writing storage", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_cad", name: "CAD", slug: "cad" }]);
    const file = uploadFile("hello");

    const response = await POST(
      formRequest({
        file,
        sourceDevice: "Mac",
        categoryId: "cat_missing"
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "category not found" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });

  it("removes uploaded bytes when metadata creation fails", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.createFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac"
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file metadata create failed" });
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith("Inbox/Mac/part.stl");
  });

  it("reports repair required when upload cleanup fails after metadata creation failure", async () => {
    const { POST } = await import("@/app/api/files/route");
    mocks.repo.createFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    mocks.storage.deleteFile.mockRejectedValue(new Error("cleanup failed"));

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac"
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file operation requires manual repair" });
  });

  it.each([
    ["projectId", { projectId: "proj_1" }],
    ["projectSlug", { projectSlug: "garage-build" }]
  ])("rejects project uploads with only %s", async (_label, fields) => {
    const { POST } = await import("@/app/api/files/route");

    const response = await POST(
      formRequest({
        file: uploadFile("hello"),
        sourceDevice: "Mac",
        ...fields
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "projectId and projectSlug must be provided together"
    });
    expect(mocks.storage.writeUpload).not.toHaveBeenCalled();
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
  });
});

function formRequest(fields: {
  file?: File;
  sourceDevice?: string;
  projectId?: string;
  projectSlug?: string;
  categoryId?: string;
}) {
  const formData = new FormData();

  if (fields.file) {
    formData.set("file", fields.file);
  }

  for (const field of ["sourceDevice", "projectId", "projectSlug", "categoryId"] as const) {
    const value = fields[field];
    if (value !== undefined) {
      formData.set(field, value);
    }
  }

  const request = new Request("http://localhost/api/files", {
    method: "POST"
  });
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

function uploadFile(contents: string) {
  const bytes = Buffer.from(contents);
  const file = new File([contents], "part.stl", { type: "model/stl" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  });
  return file;
}
