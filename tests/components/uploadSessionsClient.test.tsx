import { describe, expect, it, vi } from "vitest";
import {
  listOpenUploadSessions,
  listUploadSessions,
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
