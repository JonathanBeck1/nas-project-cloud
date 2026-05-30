import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropZone } from "@/components/workspace/DropZone";
import { DEVICE_LABEL_STORAGE_KEY } from "@/lib/client/sourceDevice";

describe("DropZone", () => {
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

  beforeEach(() => {
    window.localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, "Browser");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("uploads dropped files to the inbox with an accessible status", async () => {
    let resolveUpload: (response: Response) => void = () => {};
    const upload = new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(() => upload);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DropZone>
        <div data-testid="drop-target">Drop target</div>
      </DropZone>
    );

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("drop-target"), {
      dataTransfer: {
        files: [file]
      }
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Uploading manual.pdf");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/files\?/),
        expect.objectContaining({ method: "POST" })
      )
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(typeof url).toBe("string");
    const calledUrl = new URL(url as string, "http://localhost");
    expect(calledUrl.pathname).toBe("/api/files");
    expect(calledUrl.searchParams.get("filename")).toBe("manual.pdf");
    expect(calledUrl.searchParams.get("sourceDevice")).toBe("Browser");
    expect(calledUrl.searchParams.get("mimeType")).toBe("application/pdf");
    expect(init?.body).toBe(file);
    resolveUpload(new Response(JSON.stringify({ file: { id: "file_upload" } }), { status: 201 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
  });

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

  it("passes browser folder-relative paths to direct uploads", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DropZone>
        <div data-testid="drop-target">Drop target</div>
      </DropZone>
    );

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "Client A/Manuals/manual.pdf"
    });
    fireEvent.drop(screen.getByTestId("drop-target"), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0];
    const calledUrl = new URL(url as string, "http://localhost");
    expect(calledUrl.searchParams.get("relativePath")).toBe("Client A/Manuals/manual.pdf");
  });

  it("renders a dedicated folder picker input", async () => {
    render(
      <DropZone inputId="manual-upload">
        <label htmlFor="manual-upload">Drop files</label>
      </DropZone>
    );

    const folderInput = screen.getByLabelText("Choose folder");
    expect(folderInput).toHaveAttribute("type", "file");
    expect(folderInput).toHaveAttribute("webkitdirectory");
  });

  it("uploads large files through chunked upload sessions", async () => {
    const onUploaded = vi.fn();
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              session: {
                id: "upload_1",
                receivedBytes: 0
              }
            }),
            { status: 201 }
          )
        );
      }

      if (url === "/api/upload-sessions/upload_1/chunk") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 200 }));
      }

      if (url === "/api/upload-sessions/upload_1/complete") {
        return Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DropZone chunkedUploadThresholdBytes={4} chunkSizeBytes={3} onUploaded={onUploaded}>
        <div data-testid="drop-target">Drop target</div>
      </DropZone>
    );

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByTestId("drop-target"), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith([uploadedFile]));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/upload-sessions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "manual.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5,
          sourceDevice: "Browser"
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/upload-sessions/upload_1/chunk",
      expect.objectContaining({
        method: "POST",
        headers: { "upload-offset": "0" },
        body: file.slice(0, 3)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/upload-sessions/upload_1/chunk",
      expect.objectContaining({
        method: "POST",
        headers: { "upload-offset": "3" },
        body: file.slice(3, 5)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/upload-sessions/upload_1/complete",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
  });

  it("shows progress and lets the user cancel a chunked upload", async () => {
    const user = userEvent.setup();
    let chunkStarted = false;
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions") {
        return Promise.resolve(new Response(JSON.stringify({ session: { id: "upload_1" } }), { status: 201 }));
      }
      if (url === "/api/upload-sessions/upload_1/chunk") {
        chunkStarted = true;
        return new Promise<Response>(() => undefined);
      }
      if (url === "/api/upload-sessions/upload_1/abort") {
        return Promise.resolve(new Response(JSON.stringify({ session: { status: "aborted" } }), { status: 200 }));
      }
      return Promise.resolve(new Response("bad", { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DropZone chunkedUploadThresholdBytes={4} chunkSizeBytes={3}>
        <div data-testid="drop-target">Drop target</div>
      </DropZone>
    );

    fireEvent.drop(screen.getByTestId("drop-target"), {
      dataTransfer: { files: [new File(["hello"], "manual.pdf", { type: "application/pdf" })] }
    });

    await waitFor(() => expect(chunkStarted).toBe(true));
    await user.click(screen.getByRole("button", { name: "Cancel upload" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-sessions/upload_1/abort",
      expect.objectContaining({ method: "POST" })
    );
  });
});
