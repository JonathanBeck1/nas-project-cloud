import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailDrawer } from "@/components/workspace/DetailDrawer";
import type { CloudFile, Project } from "@/lib/shared/types";

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

const project: Project = {
  id: "proj_123",
  name: "Print Parts",
  slug: "print-parts",
  description: "",
  categoryId: null,
  status: "active",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z"
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
        projects={[project]}
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

  it("calls project assignment action with the selected project", async () => {
    const user = userEvent.setup();
    const onAssignProject = vi.fn();

    render(<DetailDrawer file={fixture} projects={[project]} onAssignProject={onAssignProject} />);

    await user.selectOptions(screen.getByLabelText("Project"), "proj_123");

    expect(onAssignProject).toHaveBeenCalledWith(fixture, "proj_123");
  });

  it("disables server-mutating actions while busy", () => {
    render(<DetailDrawer file={fixture} projects={[project]} isBusy onArchive={vi.fn()} onAssignProject={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Archive" })).toBeDisabled();
    expect(screen.getByLabelText("Project")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy path" })).toBeEnabled();
  });
});
