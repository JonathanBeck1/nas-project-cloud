import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/workspace/AppShell";
import type { Category, CloudFile, Project } from "@/lib/shared/types";

const uploadedFile: CloudFile = {
  id: "file_manual",
  name: "manual.pdf",
  extension: "pdf",
  family: "document",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  checksum: "sha256-manual",
  storagePath: "/nas/inbox/manual.pdf",
  projectId: null,
  categoryId: null,
  sourceDevice: "Browser",
  status: "active",
  archivedAt: null,
  uploadedAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z",
  tags: []
};

const notesFile: CloudFile = {
  ...uploadedFile,
  id: "file_notes",
  name: "notes.txt",
  extension: "txt",
  mimeType: "text/plain",
  sizeBytes: 512,
  checksum: "sha256-notes",
  storagePath: "/nas/inbox/notes.txt"
};

const project: Project = {
  id: "proj_123",
  name: "Printer Upgrade",
  slug: "printer-upgrade",
  description: "Printer upgrade docs",
  categoryId: null,
  status: "active",
  createdAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z"
};

const cadCategory: Category = {
  id: "cat_cad",
  name: "3D / CAD",
  slug: "3d-cad",
  color: "#3b5f73",
  isSystem: true,
  sortOrder: 10
};

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the primary workspace landmarks and real navigation entries", () => {
    const { container } = render(<AppShell initialData={{ files: [], projects: [project], categories: [], tags: [] }} />);

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    expect(screen.getAllByText("Projects")[0]).toBeVisible();
    expect(screen.getByRole("link", { name: "Printer Upgrade" })).toHaveAttribute("href", "/projects/proj_123");
    expect(screen.getByText("Local Library")).toBeVisible();
    expect(
      screen.getByText("Drop files here to move them onto the NAS now and organize them into projects when ready.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New Project" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Log out" })).toBeVisible();
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).not.toContain("#");
  });

  it("shows a successfully dropped upload in the workspace grid", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: uploadedFile }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell />);

    const file = new File(["hello"], "manual.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByText("Drop files"), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded manual.pdf");
    expect(screen.getByText("manual.pdf")).toBeVisible();
  });

  it("lets keyboard users focus and activate the visible upload control", async () => {
    const user = userEvent.setup();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

    render(<AppShell />);

    const uploadControl = screen.getByText("Drop files");

    uploadControl.focus();
    expect(uploadControl).toHaveFocus();

    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    expect(inputClick).toHaveBeenCalledTimes(2);
    expect(inputClick.mock.instances).toEqual([
      screen.getByLabelText("Choose files"),
      screen.getByLabelText("Choose files")
    ]);
  });

  it("opens the shared file chooser from the command bar upload button", async () => {
    const user = userEvent.setup();
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

    render(<AppShell />);

    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(inputClick).toHaveBeenCalledTimes(1);
    expect(inputClick.mock.instances[0]).toBe(screen.getByLabelText("Choose files"));
  });

  it("posts a project JSON payload and shows the new project in navigation", async () => {
    const user = userEvent.setup();
    const createdProject = {
      ...project,
      id: "project_print_parts",
      name: "Print Parts",
      slug: "print-parts",
      description: "Printer upgrades"
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ project: createdProject }), { status: 201 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell />);

    await user.click(screen.getByRole("button", { name: "New Project" }));
    await user.type(screen.getByLabelText("Project name"), "Print Parts");
    await user.type(screen.getByLabelText("Description"), "Printer upgrades");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Print Parts", description: "Printer upgrades" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Created project Print Parts");
    expect(screen.getByRole("link", { name: "Print Parts" })).toHaveAttribute("href", "/projects/project_print_parts");
  });

  it("selects a file and shows its actions in the detail drawer", async () => {
    const user = userEvent.setup();
    render(<AppShell initialData={{ files: [uploadedFile], projects: [], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("button", { name: "manual.pdf" }));

    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/files/file_manual/download");
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
  });

  it("filters visible files by search text", async () => {
    const user = userEvent.setup();
    const secondFile = {
      ...uploadedFile,
      id: "file_image",
      name: "render.png",
      extension: "png",
      family: "image" as const,
      mimeType: "image/png",
      storagePath: "Inbox/Browser/render.png"
    };

    render(<AppShell initialData={{ files: [uploadedFile, secondFile], projects: [], categories: [], tags: [] }} />);

    await user.type(screen.getByRole("searchbox", { name: "Search files" }), "render");

    expect(screen.getByRole("button", { name: "render.png" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
  });

  it("hides detail actions when the selected file is filtered out", async () => {
    const user = userEvent.setup();
    const imageFile = {
      ...uploadedFile,
      id: "file_image",
      name: "render.png",
      extension: "png",
      family: "image" as const,
      mimeType: "image/png",
      storagePath: "/nas/inbox/render.png"
    };

    render(<AppShell initialData={{ files: [uploadedFile, imageFile], projects: [], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("button", { name: "manual.pdf" }));

    const details = screen.getByRole("complementary", { name: "File details" });
    expect(within(details).getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      "/api/files/file_manual/download"
    );
    expect(within(details).getByRole("button", { name: "Archive" })).toBeVisible();

    await user.type(screen.getByRole("searchbox", { name: "Search files" }), "render");

    expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
    expect(within(details).getByText("Select a file to inspect its project metadata.")).toBeVisible();
    expect(within(details).queryByRole("link", { name: "Download" })).not.toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("filters visible files by source device metadata", async () => {
    const user = userEvent.setup();
    const scannerFile = {
      ...notesFile,
      sourceDevice: "Scanner",
      storagePath: "/nas/inbox/notes.txt"
    };

    render(<AppShell initialData={{ files: [uploadedFile, scannerFile], projects: [], categories: [], tags: [] }} />);

    await user.type(screen.getByRole("searchbox", { name: "Search files" }), "browser");

    expect(screen.getByRole("button", { name: "manual.pdf" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "notes.txt" })).not.toBeInTheDocument();
  });

  it("archives a selected file and removes it from the grid", async () => {
    const user = userEvent.setup();
    const archivedFile = { ...uploadedFile, status: "archived" as const, archivedAt: "2026-04-30T00:00:00.000Z" };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: archivedFile }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell initialData={{ files: [uploadedFile], projects: [], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("button", { name: "manual.pdf" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/files/file_manual/archive", { method: "POST" }));
    expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
  });

  it("bulk archives selected files from the grid", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: { status: "archived" } }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell initialData={{ files: [uploadedFile, notesFile], projects: [], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("checkbox", { name: "Select manual.pdf" }));
    await user.click(screen.getByRole("checkbox", { name: "Select notes.txt" }));

    expect(screen.getByText("2 selected")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith("/api/files/file_manual/archive", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("/api/files/file_notes/archive", { method: "POST" });
    expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "notes.txt" })).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Archived 2 files");
  });

  it("bulk assigns selected files to a project and category", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const body = JSON.parse(String(init?.body));
      const fileId = String(input).endsWith("/file_manual") ? "file_manual" : "file_notes";
      const sourceFile = fileId === "file_manual" ? uploadedFile : notesFile;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            file: {
              ...sourceFile,
              projectId: body.projectId,
              categoryId: body.categoryId,
              storagePath: `/nas/projects/printer-upgrade/${sourceFile.name}`
            }
          }),
          { status: 200 }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell initialData={{ files: [uploadedFile, notesFile], projects: [project], categories: [cadCategory], tags: [] }} />);

    await user.click(screen.getByRole("checkbox", { name: "Select manual.pdf" }));
    await user.click(screen.getByRole("checkbox", { name: "Select notes.txt" }));
    await user.selectOptions(screen.getByLabelText("Project for selected files"), "proj_123");
    await user.selectOptions(screen.getByLabelText("Category for selected files"), "cat_cad");
    await user.click(screen.getByRole("button", { name: "Apply organization" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_manual",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_cad" })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file_notes",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "proj_123", categoryId: "cat_cad" })
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Updated 2 files");
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
  });

  it("updates project assignment and keeps the selected file open", async () => {
    const user = userEvent.setup();
    const updatedFile = {
      ...uploadedFile,
      projectId: "proj_123",
      storagePath: "/nas/projects/printer-upgrade/manual.pdf",
      updatedAt: "2026-04-30T12:30:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ file: updatedFile }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell initialData={{ files: [uploadedFile], projects: [project], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("button", { name: "manual.pdf" }));
    await user.selectOptions(screen.getByLabelText("Project"), "proj_123");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file_manual",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: "proj_123" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Updated manual.pdf");
    expect(screen.getByRole("button", { name: "manual.pdf" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/files/file_manual/download");
    expect(screen.getByLabelText("Project")).toHaveValue("proj_123");
    expect(screen.getByText("/nas/projects/printer-upgrade/manual.pdf")).toBeVisible();
  });

  it("preserves a newer file selection when archiving another file finishes", async () => {
    const user = userEvent.setup();
    const archivedFile = { ...uploadedFile, status: "archived" as const, archivedAt: "2026-04-30T00:00:00.000Z" };
    const archiveResponse = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>(() => archiveResponse.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<AppShell initialData={{ files: [uploadedFile, notesFile], projects: [], categories: [], tags: [] }} />);

    await user.click(screen.getByRole("button", { name: "manual.pdf" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "notes.txt" }));

    archiveResponse.resolve(new Response(JSON.stringify({ file: archivedFile }), { status: 200 }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "manual.pdf" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "notes.txt" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("complementary", { name: "File details" })).getByText("notes.txt")).toBeVisible();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
