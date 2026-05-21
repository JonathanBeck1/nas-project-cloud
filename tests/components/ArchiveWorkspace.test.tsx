import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchiveWorkspace } from "@/components/workspace/ArchiveWorkspace";
import type { CloudFile } from "@/lib/shared/types";

const archivedFile: CloudFile = {
  id: "file_manual",
  name: "manual.pdf",
  extension: "pdf",
  family: "document",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  checksum: "sha256-manual",
  storagePath: "Archive/manual.pdf",
  projectId: null,
  categoryId: null,
  sourceDevice: "Browser",
  status: "archived",
  archivedAt: "2026-04-30T12:00:00.000Z",
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: []
};

describe("ArchiveWorkspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores archived files and removes them from archive", async () => {
    const user = userEvent.setup();
    const restoredFile = {
      ...archivedFile,
      status: "active" as const,
      storagePath: "Inbox/Restored/file_manual-manual.pdf",
      archivedAt: null
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: restoredFile }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchiveWorkspace initialFiles={[archivedFile]} />);

    await user.click(screen.getByRole("button", { name: "Restore manual.pdf" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file_manual/restore",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Restored manual.pdf");
    expect(screen.queryByText("manual.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Archive is empty")).toBeVisible();
  });

  it("permanently deletes archived files after confirmation", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchiveWorkspace initialFiles={[archivedFile]} />);

    await user.click(screen.getByRole("button", { name: "Permanently delete manual.pdf" }));

    expect(confirmSpy).toHaveBeenCalledWith("Permanently delete manual.pdf? This cannot be undone.");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file_manual/delete",
        expect.objectContaining({ method: "DELETE" })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted manual.pdf");
    expect(screen.queryByText("manual.pdf")).not.toBeInTheDocument();
  });
});
