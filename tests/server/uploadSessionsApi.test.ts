import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileFamily, UploadSession } from "@/lib/shared/types";

const mocks = vi.hoisted(() => {
  const repo = {
    createUploadSession: vi.fn(),
    listOpenUploadSessions: vi.fn(),
    listUploadSessions: vi.fn(),
    getUploadSession: vi.fn(),
    advanceUploadSession: vi.fn(),
    completeUploadSession: vi.fn(),
    failUploadSession: vi.fn(),
    abortUploadSession: vi.fn(),
    createFile: vi.fn(),
    getProjectById: vi.fn(),
    listCategories: vi.fn(),
    upsertFilePreview: vi.fn()
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
  relativePath: null,
  mimeType: "video/webm",
  sizeBytes: 11,
  receivedBytes: 0,
  checksum: null,
  targetKind: "inbox",
    sourceDevice: "Browser",
    userId: "user_1",
    deviceId: "device_1",
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
    mocks.repo.listOpenUploadSessions.mockReturnValue([]);
    mocks.repo.listUploadSessions.mockReturnValue([]);
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
    mocks.repo.upsertFilePreview.mockReturnValue({
      fileId: "file_1",
      kind: "image",
      status: "pending",
      previewPath: null,
      width: null,
      height: null,
      durationSeconds: null,
      error: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
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
        userId: "user_1",
        deviceId: "device_1",
        categoryId: "cat_media",
        tempPath: ".uploads/upload_1.part"
      })
    );
  });

  it("stores folder-relative paths on upload sessions", async () => {
    const { POST } = await import("@/app/api/upload-sessions/route");

    const response = await POST(
      jsonRequest("http://localhost/api/upload-sessions", {
        filename: "movie.webm",
        relativePath: "Shoot A/Exports/movie.webm",
        mimeType: "video/webm",
        sizeBytes: 11,
        sourceDevice: "Browser"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.repo.createUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "movie.webm",
        relativePath: "Shoot A/Exports/movie.webm"
      })
    );
  });

  it("lists open upload sessions for resume", async () => {
    const { GET } = await import("@/app/api/upload-sessions/open/route");
    mocks.repo.listOpenUploadSessions.mockReturnValue([
      { id: "upload_1", filename: "movie.webm", receivedBytes: 8388608, sizeBytes: 100000000 }
    ]);

    const response = await GET(new Request("http://localhost/api/upload-sessions/open"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [{ id: "upload_1", filename: "movie.webm", receivedBytes: 8388608, sizeBytes: 100000000 }]
    });
  });

  it("lists upload sessions filtered by status and device on the new GET endpoint", async () => {
    const { GET } = await import("@/app/api/upload-sessions/route");
    const failedSession: UploadSession = { ...openSession, status: "failed", error: "boom" };
    mocks.repo.listUploadSessions.mockReturnValue([failedSession]);

    const response = await GET(
      new Request("http://localhost/api/upload-sessions?status=failed&deviceId=device_1")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sessions: [failedSession] });
    expect(mocks.repo.listUploadSessions).toHaveBeenCalledWith({
      userId: "user_1",
      deviceId: "device_1",
      status: "failed"
    });
  });

  it("supports the 'all' status alias and ignores the 'all' deviceId placeholder", async () => {
    const { GET } = await import("@/app/api/upload-sessions/route");
    mocks.repo.listUploadSessions.mockReturnValue([]);

    const response = await GET(
      new Request("http://localhost/api/upload-sessions?status=all&deviceId=all")
    );

    expect(response.status).toBe(200);
    expect(mocks.repo.listUploadSessions).toHaveBeenCalledWith({
      userId: "user_1",
      deviceId: null,
      status: "all"
    });
  });

  it("rejects unknown status filters", async () => {
    const { GET } = await import("@/app/api/upload-sessions/route");

    const response = await GET(new Request("http://localhost/api/upload-sessions?status=garbage"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid status filter" });
    expect(mocks.repo.listUploadSessions).not.toHaveBeenCalled();
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

  it("handles one chunk at a time per session so a duplicate is rejected before it is written", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");
    let receivedBytes = 0;
    mocks.repo.getUploadSession.mockImplementation(() => ({ ...openSession, receivedBytes }));
    mocks.repo.advanceUploadSession.mockImplementation((id, input) => {
      receivedBytes = input.receivedBytes;
      return { ...openSession, id, receivedBytes };
    });
    mocks.storage.appendUploadChunk.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { receivedBytes: 5 };
    });
    const send = () =>
      POST(
        new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
          method: "POST",
          headers: { "upload-offset": "0" },
          body: "hello"
        }),
        { params: Promise.resolve({ id: "upload_1" }) }
      );

    const responses = await Promise.all([send(), send()]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.storage.appendUploadChunk).toHaveBeenCalledTimes(1);
    const rejected = responses.find((response) => response.status === 409);
    await expect(rejected?.json()).resolves.toMatchObject({ receivedBytes: 5 });
  });

  it("answers a storage offset mismatch with 409 and the offset to resume from", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");
    mocks.storage.appendUploadChunk.mockRejectedValue(
      Object.assign(new Error("Upload chunk offset mismatch"), { code: "UPLOAD_OFFSET_MISMATCH" })
    );

    const response = await POST(
      new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
        method: "POST",
        headers: { "upload-offset": "0" },
        body: "hello"
      }),
      { params: Promise.resolve({ id: "upload_1" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ receivedBytes: 0 });
  });

  it("rejects an oversized chunk by content-length without reading the body", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");
    const request = new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
      method: "POST",
      headers: { "upload-offset": "0", "content-length": String(32 * 1024 * 1024 + 1) },
      body: "hello"
    });

    const response = await POST(request, { params: Promise.resolve({ id: "upload_1" }) });

    expect(response.status).toBe(413);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.storage.appendUploadChunk).not.toHaveBeenCalled();
  });

  it("stops reading a streamed chunk once it passes the cap", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/chunk/route");
    const mebibyte = new Uint8Array(1024 * 1024);
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 64) {
          controller.close();
          return;
        }
        controller.enqueue(mebibyte);
      }
    });

    const response = await POST(
      new Request("http://localhost/api/upload-sessions/upload_1/chunk", {
        method: "POST",
        headers: { "upload-offset": "0" },
        body,
        duplex: "half"
      } as RequestInit),
      { params: Promise.resolve({ id: "upload_1" }) }
    );

    expect(response.status).toBe(413);
    expect(pulls).toBeLessThan(40);
    expect(mocks.storage.appendUploadChunk).not.toHaveBeenCalled();
  });

  it("fails the session instead of completing a temp file of the wrong size", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/complete/route");
    mocks.repo.getUploadSession.mockReturnValue({ ...openSession, receivedBytes: 11 });
    mocks.storage.completeUploadSession.mockRejectedValue(
      Object.assign(new Error("Upload temp file size mismatch"), { code: "UPLOAD_SIZE_MISMATCH" })
    );

    const response = await POST(
      new Request("http://localhost/api/upload-sessions/upload_1/complete", { method: "POST" }),
      { params: Promise.resolve({ id: "upload_1" }) }
    );

    expect(response.status).toBe(409);
    expect(mocks.repo.failUploadSession).toHaveBeenCalledWith("upload_1", "upload size mismatch");
    expect(mocks.storage.abortUploadSession).toHaveBeenCalledWith(".uploads/upload_1.part");
    expect(mocks.repo.createFile).not.toHaveBeenCalled();
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

  it("enqueues image previews when a completed upload creates image metadata", async () => {
    const { POST } = await import("@/app/api/upload-sessions/[id]/complete/route");
    mocks.repo.getUploadSession.mockReturnValue({
      ...openSession,
      filename: "render.png",
      mimeType: "image/png",
      receivedBytes: 11
    });
    mocks.classifyFile.mockReturnValue({
      extension: "png",
      family: "image" as FileFamily
    });
    mocks.storage.completeUploadSession.mockResolvedValue({
      absolutePath: "/storage/Inbox/Browser/render.png",
      relativePath: "Inbox/Browser/render.png",
      sizeBytes: 11,
      checksum: "sha256-render",
      mimeType: "image/png"
    });

    const response = await POST(new Request("http://localhost/api/upload-sessions/upload_1/complete"), {
      params: Promise.resolve({ id: "upload_1" })
    });

    expect(response.status).toBe(201);
    expect(mocks.repo.upsertFilePreview).toHaveBeenCalledWith({
      fileId: "file_1",
      kind: "image",
      status: "pending"
    });
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
