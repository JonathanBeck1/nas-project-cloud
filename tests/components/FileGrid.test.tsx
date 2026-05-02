import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileGrid } from "@/components/workspace/FileGrid";
import type { CloudFile } from "@/lib/shared/types";

const fixture: CloudFile = {
  id: "file_bracket",
  name: "bracket.stl",
  extension: "stl",
  family: "cad",
  mimeType: "model/stl",
  sizeBytes: 2048,
  checksum: "sha256-bracket",
  storagePath: "/nas/inbox/bracket.stl",
  projectId: null,
  categoryId: "cat_cad",
  sourceDevice: "Windows-PC",
  status: "active",
  archivedAt: null,
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: [],
};

const notesFixture: CloudFile = {
  ...fixture,
  id: "file_notes",
  name: "notes.txt",
  extension: "txt",
  family: "document",
  mimeType: "text/plain",
  sizeBytes: 512,
  checksum: "sha256-notes",
  storagePath: "/nas/inbox/notes.txt"
};

describe("FileGrid", () => {
  it("renders file name, formatted size, and source device", () => {
    render(<FileGrid files={[fixture]} />);

    expect(screen.getByText("bracket.stl")).toBeVisible();
    expect(screen.getByText("2 KB")).toBeVisible();
    expect(screen.getByText("Windows-PC")).toBeVisible();
  });

  it("selects a file card", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<FileGrid files={[fixture]} selectedFileId={fixture.id} onSelectFile={onSelect} />);

    const card = screen.getByRole("button", { name: "bracket.stl" });
    expect(card).toHaveAttribute("aria-pressed", "true");

    await user.click(card);

    expect(onSelect).toHaveBeenCalledWith(fixture);
  });

  it("supports selecting multiple files", async () => {
    const user = userEvent.setup();
    const onToggleSelected = vi.fn();

    render(
      <FileGrid
        files={[fixture, notesFixture]}
        selectedFileId={null}
        selectedFileIds={[fixture.id]}
        onSelectFile={vi.fn()}
        onToggleSelected={onToggleSelected}
        selectionMode="multiple"
      />
    );

    expect(screen.getByRole("checkbox", { name: "Select bracket.stl" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Select notes.txt" }));

    expect(onToggleSelected).toHaveBeenCalledWith("file_notes");
  });
});
