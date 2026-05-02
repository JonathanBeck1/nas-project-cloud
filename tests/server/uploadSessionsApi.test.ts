import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileFamily, UploadSession } from "@/lib/shared/types";

const mocks = vi.hoisted(() => {
  const repo = {
    createUploadSession: vi.fn(),
    getUploadSession: vi.fn(),
    advanceUploadSession: vi.fn(),
    completeUploadSession: vi.fn(),
    failUploadSession: vi.fn(),
    abortUploadSession: vi.fn(),
    createFile: vi.fn(),
    getProjectById: vi.fn(),
    listCategories: vi.fn()
  };
  const storage = {
    createUploadTempPath: vi.fn(),
    appendUploadChunk: vi.fn(),
    completeUploadSession: vi.fn(),
    deleteFile: vi.fn(),
    abortUploadSession: vi.fn()
  };

  return {
    appConfig: {
      maxUploadBytes: 20
    },
    db: {},
    repo,
    storage,
    classifyFile: vi.fn()
  };
});

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

const openSession: UploadSession = {
  id: "upload_1",
  filename: "movie.webm",
  mimeType: "video/webm",
  sizeBytes: 11,
  receivedBytes: 0,
  checksum: null,
  targetKind: "inbox",
  sourceDevice: "Browser",
  projectId: null,
  projectSlug: null,
  categoryId: null,
  status: "open",
  tempPath: ".uploads/upload_1.part",
  storagePath: null,
  error: null,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  completedAt: null
};

describe("upload sessions API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appConfig.maxUploadBytes = 20;
    mocks.repo.listCategories.mockReturnValue([{ id: "cat_media", name: "Media", slug: "media" }]);
    mocks.repo.getProjectById.mockReturnValue(null);
    mocks.repo.createUploadSession.mockReturnValue(openSession);
    mocks.repo.getUploadSession.mockReturnValue(openSession);
    mocks.repo.advanceUploadSession.mockImplementation((id, input) => ({
      ...openSession,
      id,
      receivedBytes: input.receivedBytes
    }));
    mocks.repo.completeUploadSession.mockImplementation((id, input) => ({
      ...openSession,
      id,
      status: "completed",
      receivedBytes: 11,
      storagePath: input.storagePath
    }));
    mocks.repo.failUploadSession.mockReturnValue({ ...openSession, status: "failed" });
    mocks.repo.abortUploadSession.mockReturnValue({ ...openSession, status: "aborted" });
    mocks.repo.createFile.mockImplementation((input) => ({
      id: "file_1",
      uploadedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      tags: [],
      ...input
    }));
    mocks.storage.createUploadTempPath.mockResolvedValue({
      absolutePath: "/storage/.uploads/upload_1.part",
      relativePath: ".uploads/upload_1.part"
    });
    mocks.storage.appendUploadChunk.mockResolvedValue({ receivedBytes: 5 });
    mocks.storage.completeUploadSession.mockResolvedValue({
      absolutePath: "/storage/Inbox/Browser/movie.webm",
      relativePath: "Inbox/Browser/movie.webm",
      sizeBytes: 11,
      checksum: "sha256-movie",
      mimeType: "video/webm"
    });
    mocks.storage.deleteFile.mockResolvedValue(undefined);
    mocks.storage.abortUploadSession.mockResolvedValue(undefined);
    mocks.classifyFile.mockReturnValue({
      extension: "webm",
      family: "video" as FileFamily
    });
  });

  it("creates an inbox upload session with a temp file", async () => {
    const { POST } = await import("@/app/api/upload-sessions/route");

    const response = await POST(
      jsonRequest("http://localhost/api/upload-sessions", {
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 11,
        sourceDevice: "Browser",
        categoryId: "cat_media"
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ session: openSession });
    expect(mocks.storage.createUploadTempPath).toHaveBeenCalledWith(expect.stringMatching(/^upload_/));
    expect(mocks.repo.createUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 11,
        targetKind: "inbox",
        sourceDevice: "Browser",
        categoryId: "cat_media",
        tempPath: ".uploads/upload_1.part"
      })
    );
  });

  it("rejects missing projects before creating a temp file", async () => {
    const { POST } = await import("@/app/api/upload-sessions/route");

    const response = await POST(
      jsonRequest("http://localhost/api/upload-sessions", {
        filename: "movie.webm",
        mimeType: "video/webm",
        sizeBytes: 11,
        sourceDevice: "Browser",
        projectId: "proj_missing",
        projectSlug: "garage-build"
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "project not found" });
    expect(mocks.storage.createUploadTempPath).not.toHaveBeenCalled();
  });

  it("appends a chunk at the expected offset", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");

    const response = await POST(
      new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
        method: "POST",
        headers: { "upload-offset": "0" },
        body: "hello"
      }),
      { params: Promise.resolve({ id: "upload_1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: expect.objectContaining({ id: "upload_1", receivedBytes: 5 })
    });
    expect(mocks.storage.appendUploadChunk).toHaveBeenCalledWith({
      tempRelativePath: ".uploads/upload_1.part",
      offset: 0,
      bytes: Buffer.from("hello")
    });
  });

  it("rejects chunk offset mismatches before writing storage", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");
    mocks.repo.getUploadSession.mockReturnValue({ ...openSession, receivedBytes: 4 });

    const response = await POST(
      new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
        method: "POST",
        headers: { "upload-offset": "0" },
        body: "hello"
      }),
      { params: Promise.resolve({ id: "upload_1" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "upload offset mismatch", receivedBytes: 4 });
    expect(mocks.storage.appendUploadChunk).not.toHaveBeenCalled();
  });

  it("completes a session into normal file metadata", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/complete/route");
    mocks.repo.getUploadSession.mockReturnValue({ ...openSession, receivedBytes: 11 });

    const response = await POST(new Request("http://localhost/api/upload-sessions/upload_1/complete"), {
      params: Promise.resolve({ id: "upload_1" })
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      file: expect.objectContaining({
        name: "movie.webm",
        storagePath: "Inbox/Browser/movie.webm",
        sourceDevice: "Browser"
      }),
      session: expect.objectContaining({ status: "completed" })
    });
    expect(mocks.repo.createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "movie.webm",
        extension: "webm",
        family: "video",
        storagePath: "Inbox/Browser/movie.webm"
      })
    );
  });

  it("cleans up completed bytes when metadata creation fails", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/complete/route");
    mocks.repo.getUploadSession.mockReturnValue({ ...openSession, receivedBytes: 11 });
    mocks.repo.createFile.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await POST(new Request("http://localhost/api/upload-sessions/upload_1/complete"), {
      params: Promise.resolve({ id: "upload_1" })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "file metadata create failed" });
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith("Inbox/Browser/movie.webm");
    expect(mocks.repo.failUploadSession).toHaveBeenCalledWith("upload_1", "file metadata create failed");
  });

  it("aborts open sessions and removes temp bytes", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/abort/route");

    const response = await POST(new Request("http://localhost/api/upload-sessions/upload_1/abort"), {
      params: Promise.resolve({ id: "upload_1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      session: expect.objectContaining({ status: "aborted" })
    });
    expect(mocks.storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_1.part");
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
