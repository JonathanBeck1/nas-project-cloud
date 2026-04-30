import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/workspace/AppShell";
import type { CloudFile, Project } from "@/lib/shared/types";

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

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the primary workspace landmarks and navigation entries", () => {
    render(<AppShell />);

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    expect(screen.getByText("Projects")).toBeVisible();
    expect(screen.getByText("Local Library")).toBeVisible();
    expect(
      screen.getByText("Drop files here to move them onto the NAS now and organize them into projects when ready.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New Project" })).toBeVisible();
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

  it("posts a project JSON payload from the project dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ project: { id: "project_print_parts" } }), { status: 201 }))
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
