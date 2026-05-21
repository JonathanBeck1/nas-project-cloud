import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadCenter } from "@/components/workspace/UploadCenter";
import type { UploadSession } from "@/lib/shared/types";

const openSession: UploadSession = {
  id: "upload_1",
  filename: "movie.webm",
  mimeType: "video/webm",
  sizeBytes: 2048,
  receivedBytes: 1024,
  checksum: null,
  userId: "user_1",
  deviceId: "device_1",
  targetKind: "inbox",
  sourceDevice: "Windows PC",
  projectId: null,
  projectSlug: null,
  categoryId: null,
  status: "open",
  tempPath: ".uploads/upload_1.part",
  storagePath: null,
  error: null,
  createdAt: "2026-05-04T00:00:00.000Z",
  updatedAt: "2026-05-04T00:01:00.000Z",
  completedAt: null
};

describe("UploadCenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders open upload sessions", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [openSession] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCenter />);

    expect(await screen.findByText("movie.webm")).toBeVisible();
    expect(screen.getByText("1 KB / 2 KB")).toBeVisible();
    expect(screen.getByText("Windows PC")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/upload-sessions/open", { method: "GET" });
  });

  it("aborts an open upload session and removes it from the center", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>((url) => {
      if (url === "/api/upload-sessions/open") {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [openSession] }), { status: 200 }));
      }
      if (url === "/api/upload-sessions/upload_1/abort") {
        return Promise.resolve(new Response(JSON.stringify({ session: { ...openSession, status: "aborted" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCenter />);

    await screen.findByText("movie.webm");
    await user.click(screen.getByRole("button", { name: "Abort movie.webm" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/upload-sessions/upload_1/abort",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Aborted movie.webm");
    expect(screen.queryByText("movie.webm")).not.toBeInTheDocument();
  });
});
