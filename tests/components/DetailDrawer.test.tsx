import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
