import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailDrawer } from "@/components/workspace/DetailDrawer";
import type { CloudFile } from "@/lib/shared/types";

const fixture: CloudFile = {
  id: "file_manual",
  name: "assembly manual.pdf",
  extension: "pdf",
  family: "document",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  checksum: "sha256-manual",
  storagePath: "Inbox/Browser/assembly manual.pdf",
  projectId: null,
  categoryId: null,
  sourceDevice: "Browser",
  status: "active",
  archivedAt: null,
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: []
};

describe("DetailDrawer", () => {
  it("shows selected file storage path metadata", () => {
    render(<DetailDrawer file={fixture} />);

    expect(screen.getByText("Path")).toBeVisible();
    expect(screen.getByText("Inbox/Browser/assembly manual.pdf")).toBeVisible();
  });

  it("renders file action controls", () => {
    const onArchive = vi.fn();
    const onAssignProject = vi.fn();

    render(
      <DetailDrawer
        file={fixture}
        projects={[
          {
            id: "proj_123",
            name: "Print Parts",
            slug: "print-parts",
            description: "",
            categoryId: null,
            status: "active",
            createdAt: "2026-04-30T00:00:00.000Z",
            updatedAt: "2026-04-30T00:00:00.000Z"
          }
        ]}
        onArchive={onArchive}
        onAssignProject={onAssignProject}
      />
    );

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/files/file_manual/download"
    );
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
    expect(screen.getByLabelText("Project")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeVisible();
  });

  it("calls archive action for the selected file", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();

    render(<DetailDrawer file={fixture} projects={[]} onArchive={onArchive} onAssignProject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(onArchive).toHaveBeenCalledWith(fixture);
  });
});
