import { describe, expect, it, vi } from "vitest";
import { uploadFileInChunks } from "@/lib/client/uploadSessions";

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
});
