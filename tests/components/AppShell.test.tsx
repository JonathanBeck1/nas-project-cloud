import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/workspace/AppShell";
import type { CloudFile } from "@/lib/shared/types";

const uploadedFile: CloudFile = {
  id: "file_manual",
  name: "manual.pdf",
  extension: "pdf",
  family: "document",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  checksum: "sha256-manual",
  storagePath: "/nas/inbox/manual.pdf",
  projectId: null,
  categoryId: null,
  sourceDevice: "Browser",
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: []
};

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the primary workspace landmarks and navigation entries", () => {
    render(<AppShell />);

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Projects")).toBeVisible();
    expect(screen.getByText("Local Library")).toBeVisible();
    expect(
      screen.getByText("Drop files here to move them onto the NAS now and organize them into projects when ready.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New Project" })).toBeVisible();
  });

  it("shows a successfully dropped upload in the workspace grid", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell />);

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByText("Drop files"), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
    expect(screen.getByText("manual.pdf")).toBeVisible();
  });
});
