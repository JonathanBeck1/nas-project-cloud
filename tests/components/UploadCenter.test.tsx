import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const failedSession: UploadSession = {
  ...openSession,
  id: "upload_2",
  filename: "report.pdf",
  status: "failed",
  sourceDevice: "Mac Studio",
  receivedBytes: 512,
  error: "chunk hash mismatch",
  updatedAt: "2026-05-04T00:02:00.000Z"
};

describe("UploadCenter", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads and renders open upload sessions through the new endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [openSession] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCenter />);

    expect(await screen.findByText("movie.webm")).toBeVisible();
    expect(screen.getByText("1 KB / 2 KB")).toBeVisible();
    expect(screen.getByText("Windows PC")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/upload-sessions?status=open",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("aborts an open upload session and removes it from the center", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      const target = typeof url === "string" ? url : url.toString();
      if (target.startsWith("/api/upload-sessions?")) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [openSession] }), { status: 200 }));
      }
      if (target === "/api/upload-sessions/upload_1/abort") {
        expect(init?.method).toBe("POST");
        return Promise.resolve(
          new Response(JSON.stringify({ session: { ...openSession, status: "aborted" } }), { status: 200 })
        );
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

  it("switches to the Failed tab, shows the error, and persists the choice", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>((url) => {
      const target = typeof url === "string" ? url : url.toString();
      if (target.includes("status=failed")) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [failedSession] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCenter />);

    await user.click(screen.getByRole("tab", { name: "Failed" }));

    expect(await screen.findByText("report.pdf")).toBeVisible();
    expect(screen.getByText("chunk hash mismatch")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Abort/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy error/ })).toBeVisible();
    expect(window.localStorage.getItem("nas-cloud:upload-center:tab")).toBe("failed");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("status=failed"),
        expect.objectContaining({ method: "GET" })
      )
    );
  });

  it("renders an explicit empty state per tab", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ sessions: [] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<UploadCenter initialSessions={[]} />);

    expect(screen.getByText("No open uploads")).toBeVisible();
  });
});
