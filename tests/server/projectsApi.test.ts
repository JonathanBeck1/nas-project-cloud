import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredZip } from "../helpers/readZip";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getProjectById: vi.fn(),
    getCategoryById: vi.fn(),
    listFiles: vi.fn(),
    updateProject: vi.fn(),
    updateFile: vi.fn(),
    deleteProject: vi.fn()
  },
  storage: {
    absolutePathFor: vi.fn(),
    resolveReadPath: vi.fn(),
    moveToInbox: vi.fn()
  },
  requireApiSession: vi.fn()
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/metadata")>();
  return {
    ...original,
    createMetadataRepository: vi.fn(() => mocks.repo)
  };
});
vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/storage", () => ({
  createStorageService: vi.fn(() => mocks.storage)
}));

const project = {
  id: "proj_garage",
  name: "Garage Build",
  slug: "garage-build",
  description: "",
  categoryId: null,
  status: "active" as const,
  createdAt: "2026-04-30T12:00:00.000Z",
  updatedAt: "2026-04-30T12:00:00.000Z"
};

describe("projects API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.resolveReadPath.mockImplementation(async (relativePath: string) =>
      mocks.storage.absolutePathFor(relativePath)
    );
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.repo.getProjectById.mockReturnValue(null);
    mocks.repo.listFiles.mockReturnValue([]);
    mocks.repo.updateFile.mockReturnValue(null);
    mocks.storage.absolutePathFor.mockImplementation((relativePath: string) => path.join(os.tmpdir(), relativePath));
    mocks.storage.moveToInbox.mockResolvedValue({ absolutePath: "/tmp/file", relativePath: "Inbox/Browser/file.txt" });
  });

  it("updates the name and description of an existing project", async () => {
    const updated = { ...project, name: "Garage Build v2", description: "Phase 2." };
    mocks.repo.updateProject.mockReturnValue(updated);
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/proj_garage", {
        name: "Garage Build v2",
        description: "Phase 2."
      }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ project: updated });
    expect(mocks.repo.updateProject).toHaveBeenCalledWith("proj_garage", {
      name: "Garage Build v2",
      description: "Phase 2."
    });
  });

  it("transitions project status", async () => {
    mocks.repo.updateProject.mockReturnValue({ ...project, status: "complete" });
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/proj_garage", { status: "complete" }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.repo.updateProject).toHaveBeenCalledWith("proj_garage", { status: "complete" });
  });

  it("rejects an unknown status value", async () => {
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/proj_garage", { status: "shipped" }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.repo.updateProject).not.toHaveBeenCalled();
  });

  it("rejects an empty patch", async () => {
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/proj_garage", {}),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(400);
  });

  it("validates the new categoryId before updating", async () => {
    mocks.repo.getCategoryById.mockReturnValue(null);
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/proj_garage", { categoryId: "cat_missing" }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.repo.updateProject).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    mocks.repo.updateProject.mockReturnValue(null);
    const { PATCH } = await import("@/app/api/projects/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/projects/missing", { name: "New name" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });

  it("deletes a project and reports the number of detached files", async () => {
    mocks.repo.deleteProject.mockReturnValue({ removed: true, detachedFiles: 3 });
    const { DELETE } = await import("@/app/api/projects/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/projects/proj_garage", { method: "DELETE" }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, detachedFiles: 3, movedFiles: 0 });
    expect(mocks.repo.deleteProject).toHaveBeenCalledWith("proj_garage");
  });

  it("moves active project files back to inbox before deleting when requested", async () => {
    mocks.repo.getProjectById.mockReturnValue(project);
    mocks.repo.listFiles.mockReturnValue([
      {
        id: "file_1",
        name: "bracket.stl",
        status: "active",
        storagePath: "Projects/garage-build/Inbox/bracket.stl",
        sourceDevice: "Mac Studio"
      }
    ]);
    mocks.storage.moveToInbox.mockResolvedValue({
      absolutePath: "/tmp/Inbox/Mac Studio/bracket.stl",
      relativePath: "Inbox/Mac Studio/bracket.stl"
    });
    mocks.repo.updateFile.mockReturnValue({ id: "file_1" });
    mocks.repo.deleteProject.mockReturnValue({ removed: true, detachedFiles: 1 });
    const { DELETE } = await import("@/app/api/projects/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/projects/proj_garage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileAction: "moveToInbox" })
      }),
      { params: Promise.resolve({ id: "proj_garage" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.storage.moveToInbox).toHaveBeenCalledWith({
      currentRelativePath: "Projects/garage-build/Inbox/bracket.stl",
      sourceDevice: "Mac Studio",
      filename: "bracket.stl"
    });
    expect(mocks.repo.updateFile).toHaveBeenCalledWith(
      "file_1",
      { projectId: null, storagePath: "Inbox/Mac Studio/bracket.stl" },
      { storagePath: "Projects/garage-build/Inbox/bracket.stl", status: "active" }
    );
    await expect(response.json()).resolves.toEqual({ ok: true, detachedFiles: 1, movedFiles: 1 });
  });

  it("returns 404 when deleting a missing project", async () => {
    mocks.repo.deleteProject.mockReturnValue({ removed: false, detachedFiles: 0 });
    const { DELETE } = await import("@/app/api/projects/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/projects/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) }
    );

    expect(response.status).toBe(404);
  });

  it("streams an active project's files as a zip archive", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-project-api-"));
    try {
      fs.mkdirSync(path.join(dir, "Projects", "garage-build", "Inbox"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Projects", "garage-build", "Inbox", "bracket.stl"), "model");
      fs.writeFileSync(path.join(dir, "Projects", "garage-build", "Inbox", "notes.txt"), "notes");
      mocks.storage.absolutePathFor.mockImplementation((relativePath: string) => path.join(dir, relativePath));
      mocks.repo.getProjectById.mockReturnValue(project);
      mocks.repo.listFiles.mockReturnValue([
        {
          id: "file_1",
          name: "bracket.stl",
          status: "active",
          storagePath: "Projects/garage-build/Inbox/bracket.stl"
        },
        {
          id: "file_2",
          name: "notes.txt",
          status: "active",
          storagePath: "Projects/garage-build/Inbox/notes.txt"
        }
      ]);
      const { GET } = await import("@/app/api/projects/[id]/download/route");

      const response = await GET(new Request("http://localhost/api/projects/proj_garage/download"), {
        params: Promise.resolve({ id: "proj_garage" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/zip");
      expect(response.headers.get("content-disposition")).toContain('filename="garage-build.zip"');
      expect(mocks.repo.listFiles).toHaveBeenCalledWith({ projectId: "proj_garage" });
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports nested folders intact and lists files missing on disk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-project-api-"));
    try {
      const inbox = path.join(dir, "Projects", "garage-build", "Inbox");
      fs.mkdirSync(path.join(inbox, "Shoot A", "Exports"), { recursive: true });
      fs.mkdirSync(path.join(inbox, "Shoot B"), { recursive: true });
      fs.mkdirSync(path.join(dir, "Inbox", "Mac"), { recursive: true });
      fs.writeFileSync(path.join(inbox, "Shoot A", "Exports", "movie.webm"), "a-movie");
      fs.writeFileSync(path.join(inbox, "Shoot B", "movie.webm"), "b-movie");
      fs.writeFileSync(path.join(dir, "Inbox", "Mac", "stray.txt"), "stray");
      mocks.storage.absolutePathFor.mockImplementation((relativePath: string) => path.join(dir, relativePath));
      mocks.repo.getProjectById.mockReturnValue(project);
      mocks.repo.listFiles.mockReturnValue(
        [
          "Projects/garage-build/Inbox/Shoot A/Exports/movie.webm",
          "Projects/garage-build/Inbox/Shoot B/movie.webm",
          "Projects/garage-build/Inbox/Shoot B/renamed-over-smb.stl",
          "Inbox/Mac/stray.txt"
        ].map((storagePath, index) => ({
          id: `file_${index}`,
          name: path.posix.basename(storagePath),
          status: "active",
          storagePath
        }))
      );
      const { GET } = await import("@/app/api/projects/[id]/download/route");

      const response = await GET(new Request("http://localhost/api/projects/proj_garage/download"), {
        params: Promise.resolve({ id: "proj_garage" })
      });

      expect(response.status).toBe(200);
      const entries = readStoredZip(new Uint8Array(await response.arrayBuffer()));
      expect(Object.fromEntries(entries)).toEqual({
        "Shoot A/Exports/movie.webm": "a-movie",
        "Shoot B/movie.webm": "b-movie",
        "stray.txt": "stray",
        "_MISSING.txt": expect.stringContaining("Shoot B/renamed-over-smb.stl")
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
