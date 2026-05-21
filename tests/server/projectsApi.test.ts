import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    getProjectById: vi.fn(),
    getCategoryById: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn()
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
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
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
    await expect(response.json()).resolves.toEqual({ ok: true, detachedFiles: 3 });
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
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
