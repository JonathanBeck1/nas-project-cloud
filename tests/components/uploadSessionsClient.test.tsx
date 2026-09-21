import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listOpenUploadSessions,
  listUploadSessions,
  resumeUploadSession,
  uploadFileInChunks
} from "@/lib/client/uploadSessions";

describe("uploadFileInChunks", () => {
  it("reports progress while uploading chunks", async () => {
    const progress = vi.fn();
    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 5 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "manual.pdf" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    const fileRecord = await uploadFileInChunks({
      file,
      sourceDevice: "Browser",
      chunkSizeBytes: 5,
      fetchImpl: fetchMock,
      onProgress: progress
    });

    expect(fileRecord).toEqual({ id: "file_1", name: "manual.pdf" });
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 5, totalBytes: 5 });
  });

  it("sends browser folder-relative paths when creating chunked sessions", async () => {
    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "Client A/Manuals/manual.pdf"
    });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 5 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "manual.pdf" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    await uploadFileInChunks({
      file,
      sourceDevice: "Browser",
      chunkSizeBytes: 5,
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/upload-sessions",
      expect.objectContaining({
        body: JSON.stringify({
          filename: "manual.pdf",
          relativePath: "Client A/Manuals/manual.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5,
          sourceDevice: "Browser"
        })
      })
    );
  });

  it("sends project targets when creating chunked sessions", async () => {
    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 5 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "manual.pdf" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    await uploadFileInChunks({
      file,
      sourceDevice: "Browser",
      projectId: "proj_1",
      projectSlug: "garage-build",
      chunkSizeBytes: 5,
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/upload-sessions",
      expect.objectContaining({
        body: JSON.stringify({
          filename: "manual.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5,
          sourceDevice: "Browser",
          projectId: "proj_1",
          projectSlug: "garage-build"
        })
      })
    );
  });

  it("can override the browser relative path when creating chunked sessions", async () => {
    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 5 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "manual.pdf" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    await uploadFileInChunks({
      file,
      sourceDevice: "Browser",
      relativePath: "Client A/Manuals/manual.pdf",
      chunkSizeBytes: 5,
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/upload-sessions",
      expect.objectContaining({
        body: JSON.stringify({
          filename: "manual.pdf",
          relativePath: "Client A/Manuals/manual.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5,
          sourceDevice: "Browser"
        })
      })
    );
  });

  it("lists open upload sessions through the unified endpoint", async () => {
    const sessions = [{ id: "upload_1", filename: "movie.webm", receivedBytes: 1024, sizeBytes: 2048 }];
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions }), { status: 200 }))
    );

    await expect(listOpenUploadSessions(fetchMock)).resolves.toEqual(sessions);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-sessions?status=open",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("threads status and device filters through listUploadSessions", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [] }), { status: 200 }))
    );

    await listUploadSessions({ status: "failed", deviceId: "device_1", fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-sessions?status=failed&deviceId=device_1",
      expect.objectContaining({ method: "GET" })
    );
  });
});

describe("resumeUploadSession", () => {
  it("continues from the stored offset and completes the session", async () => {
    const file = new File([new Uint8Array(10)], "movie.webm", { type: "video/webm" });
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes: 10 } }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1", name: "movie.webm" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });

    await expect(
      resumeUploadSession({
        sessionId: "upload_1",
        file,
        receivedBytes: 4,
        sizeBytes: 10,
        chunkSizeBytes: 4,
        fetchImpl: fetchMock
      })
    ).resolves.toEqual({ id: "file_1", name: "movie.webm" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/upload-sessions/upload_1/chunk",
      expect.objectContaining({
        method: "POST",
        headers: { "upload-offset": "4" },
        body: file.slice(4, 8)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/upload-sessions/upload_1/chunk",
      expect.objectContaining({
        method: "POST",
        headers: { "upload-offset": "8" },
        body: file.slice(8, 10)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/upload-sessions/upload_1/complete",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("chunk retry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function chunkFetch(chunkResponses: Array<() => Promise<Response>>) {
    return vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions/upload_1/chunk") {
        const next = chunkResponses.shift();
        return next ? next() : Promise.resolve(new Response("{}", { status: 500 }));
      }
      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: { id: "file_1" } }), { status: 201 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });
  }

  const ok = (receivedBytes: number) => () =>
    Promise.resolve(new Response(JSON.stringify({ session: { receivedBytes } }), { status: 200 }));
  const status = (code: number, body: object = {}) => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status: code }));

  function resume(fetchMock: typeof fetch) {
    return resumeUploadSession({
      sessionId: "upload_1",
      file: new File([new Uint8Array(10)], "movie.webm"),
      receivedBytes: 0,
      sizeBytes: 10,
      chunkSizeBytes: 4,
      fetchImpl: fetchMock
    });
  }

  const chunkOffsets = (fetchMock: ReturnType<typeof chunkFetch>) =>
    fetchMock.mock.calls
      .filter(([url]) => url === "/api/upload-sessions/upload_1/chunk")
      .map(([, init]) => (init?.headers as Record<string, string>)["upload-offset"]);

  it("retries a chunk after a network error and a 5xx", async () => {
    vi.useFakeTimers();
    const fetchMock = chunkFetch([
      () => Promise.reject(new TypeError("Failed to fetch")),
      status(503),
      ok(4),
      ok(8),
      ok(10)
    ]);

    const upload = resume(fetchMock);
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ id: "file_1" });
    expect(chunkOffsets(fetchMock)).toEqual(["0", "0", "0", "4", "8"]);
  });

  it("resumes from the server's offset after a 409", async () => {
    vi.useFakeTimers();
    const fetchMock = chunkFetch([
      status(409, { error: "upload offset mismatch", receivedBytes: 4 }),
      ok(8),
      ok(10)
    ]);

    const upload = resume(fetchMock);
    await vi.runAllTimersAsync();

    await expect(upload).resolves.toEqual({ id: "file_1" });
    expect(chunkOffsets(fetchMock)).toEqual(["0", "4", "8"]);
  });

  it("gives up after repeated failures", async () => {
    vi.useFakeTimers();
    const fetchMock = chunkFetch([]);

    const upload = resume(fetchMock);
    const settled = expect(upload).rejects.toThrow("Upload failed");
    await vi.runAllTimersAsync();

    await settled;
    expect(chunkOffsets(fetchMock)).toEqual(["0", "0", "0", "0"]);
  });

  it("does not retry a rejected chunk", async () => {
    const fetchMock = chunkFetch([status(413, { error: "chunk exceeds declared upload size" })]);

    await expect(resume(fetchMock)).rejects.toThrow("chunk exceeds declared upload size");
    expect(chunkOffsets(fetchMock)).toEqual(["0"]);
  });
});
