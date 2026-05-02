import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "@/components/workspace/ProjectWorkspace";
import type { CloudFile, Project } from "@/lib/shared/types";

const project: Project = {
  id: "proj_1",
  name: "Garage Build",
  slug: "garage-build",
  description: "Parts",
  categoryId: null,
  status: "active",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z"
};

const fileFixture: CloudFile = {
  id: "file_1",
  name: "bracket.stl",
  extension: "stl",
  family: "cad",
  mimeType: "model/stl",
  sizeBytes: 2048,
  checksum: "sha256-bracket",
  storagePath: "Projects/garage-build/Inbox/bracket.stl",
  projectId: "proj_1",
  categoryId: null,
  sourceDevice: "Browser",
  status: "active",
  archivedAt: null,
  uploadedAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  tags: []
};

describe("ProjectWorkspace", () => {
  it("renders project files and project metadata", () => {
    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    expect(screen.getByRole("heading", { name: "Garage Build" })).toBeVisible();
    expect(screen.getByText("Parts")).toBeVisible();
    expect(screen.getByText("bracket.stl")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search project files" })).toBeVisible();
  });
});
