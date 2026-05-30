import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("shows detail drawer actions for the selected project file", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    await user.click(screen.getByRole("button", { name: "bracket.stl" }));

    const details = screen.getByRole("complementary", { name: "File details" });
    expect(within(details).getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/files/file_1/download"
    );
    expect(within(details).getByDisplayValue("bracket.stl")).toBeVisible();
  });

  it("archives a selected project file from the detail drawer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ file: { ...fileFixture, status: "archived", archivedAt: "2026-05-02T01:00:00.000Z" } }), {
          status: 200
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    await user.click(screen.getByRole("button", { name: "bracket.stl" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file_1/archive",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(screen.queryByRole("button", { name: "bracket.stl" })).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Archived bracket.stl");
  });

  it("renames a selected project file from the detail drawer", async () => {
    const user = userEvent.setup();
    const renamedFile = {
      ...fileFixture,
      name: "bracket-v2.stl",
      storagePath: "Projects/garage-build/Inbox/bracket-v2.stl"
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: renamedFile }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectWorkspace project={project} files={[fileFixture]} categories={[]} tags={[]} />);

    await user.click(screen.getByRole("button", { name: "bracket.stl" }));
    await user.clear(screen.getByLabelText("File name"));
    await user.type(screen.getByLabelText("File name"), "bracket-v2.stl");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file_1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "bracket-v2.stl" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Renamed bracket-v2.stl");
    expect(screen.getByRole("button", { name: "bracket-v2.stl" })).toBeVisible();
  });
});
