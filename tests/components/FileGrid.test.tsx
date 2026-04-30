import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
