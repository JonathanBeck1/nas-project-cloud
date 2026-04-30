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
});
