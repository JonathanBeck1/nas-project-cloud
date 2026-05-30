import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders project files and project metadata", () => {
    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    expect(screen.getByRole("heading", { name: "Garage Build" })).toBeVisible();
    expect(screen.getByText("Parts")).toBeVisible();
    expect(screen.getByText("bracket.stl")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search project files" })).toBeVisible();
  });

  it("links to a project zip export", () => {
    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    expect(screen.getByRole("link", { name: "Download project ZIP" })).toHaveAttribute(
      "href",
      "/api/projects/proj_1/download"
    );
  });

  it("exposes a selected-file zip link for checked project files", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    await user.click(screen.getByRole("checkbox", { name: "Select bracket.stl" }));

    expect(screen.getByRole("link", { name: "Download ZIP" })).toHaveAttribute(
      "href",
      "/api/files/bulk/download?fileIds=file_1"
    );
  });

  it("uploads selected files into the project workspace", async () => {
    const user = userEvent.setup();
    const uploadedFile: CloudFile = {
      ...fileFixture,
      id: "file_uploaded",
      name: "wiring.pdf",
      extension: "pdf",
      family: "document",
      mimeType: "application/pdf",
      storagePath: "Projects/garage-build/Inbox/wiring.pdf"
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectWorkspace project={project} files={[]} categories={[]} tags={[]} />);

    await user.upload(screen.getByLabelText("Choose files"), new File(["plan"], "wiring.pdf", { type: "application/pdf" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/files\?/),
        expect.objectContaining({ method: "POST" })
      )
    );
    const [url] = fetchMock.mock.calls[0];
    const calledUrl = new URL(url as string, "http://localhost");
    expect(calledUrl.searchParams.get("projectId")).toBe(project.id);
    expect(calledUrl.searchParams.get("projectSlug")).toBe(project.slug);
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded wiring.pdf");
    expect(screen.getByRole("button", { name: "wiring.pdf" })).toBeVisible();
  });

  it("exposes a folder picker for project uploads", () => {
    render(<ProjectWorkspace project={project} files={[]} categories={[]} tags={[]} />);

    const folderInput = screen.getByLabelText("Choose folder");
    expect(folderInput).toHaveAttribute("type", "file");
    expect(folderInput).toHaveAttribute("webkitdirectory");
  });
});
