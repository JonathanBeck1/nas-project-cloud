import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  listSmartViewFiles: vi.fn(),
  repo: {
    createProject: vi.fn(),
    listCategories: vi.fn(),
    listProjects: vi.fn(),
    listTags: vi.fn()
  }
}));

vi.mock("@/lib/server/db", () => ({
  getDatabase: vi.fn(() => mocks.db)
}));

vi.mock("@/lib/server/auth/guards", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, userId: "user_1", sessionId: "session_1", deviceId: "device_1" }))
}));

vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: vi.fn(() => mocks.repo)
}));

vi.mock("@/lib/server/smartViews", () => ({
  listSmartViewFiles: mocks.listSmartViewFiles
}));

describe("workspace API modules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repo.listCategories.mockReturnValue([]);
    mocks.repo.listProjects.mockReturnValue([]);
    mocks.repo.listTags.mockReturnValue([]);
    mocks.repo.createProject.mockReturnValue({
      id: "proj_123",
      name: "NAS Project",
      slug: "nas-project",
      description: "",
      categoryId: null,
      status: "active",
      createdAt: "2026-04-30T12:00:00.000Z",
      updatedAt: "2026-04-30T12:00:00.000Z"
    });
  });

  it("exports project handlers", async () => {
    const route = await import("@/app/api/projects/route");
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("returns projects from the repository", async () => {
    const route = await import("@/app/api/projects/route");
    const projects = [{ id: "proj_123", name: "NAS Project" }];
    mocks.repo.listProjects.mockReturnValue(projects);

    const response = await route.GET(new Request("http://localhost/api/projects"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ projects });
    expect(mocks.repo.listProjects).toHaveBeenCalledTimes(1);
  });

  it("exports category and tag handlers", async () => {
    const categories = await import("@/app/api/categories/route");
    const tags = await import("@/app/api/tags/route");
    expect(typeof categories.GET).toBe("function");
    expect(typeof tags.GET).toBe("function");
  });

  it("returns categories from the repository", async () => {
    const route = await import("@/app/api/categories/route");
    const categories = [{ id: "cat_1", name: "CAD" }];
    mocks.repo.listCategories.mockReturnValue(categories);

    const response = await route.GET(new Request("http://localhost/api/categories"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ categories });
    expect(mocks.repo.listCategories).toHaveBeenCalledTimes(1);
  });

  it("returns tags from the repository", async () => {
    const route = await import("@/app/api/tags/route");
    const tags = [{ id: "tag_1", name: "fixture" }];
    mocks.repo.listTags.mockReturnValue(tags);

    const response = await route.GET(new Request("http://localhost/api/tags"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tags });
    expect(mocks.repo.listTags).toHaveBeenCalledTimes(1);
  });

  it("exports smart view handler", async () => {
    const route = await import("@/app/api/smart-views/[view]/route");
    expect(typeof route.GET).toBe("function");
  });

  it("returns files for a known smart view", async () => {
    const route = await import("@/app/api/smart-views/[view]/route");
    const files = [{ id: "file_1", name: "part.stl" }];
    mocks.listSmartViewFiles.mockReturnValue({ files, truncated: false });

    const response = await route.GET(new Request("http://localhost/api/smart-views/cad"), {
      params: Promise.resolve({ view: "cad" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ files, truncated: false });
    expect(mocks.listSmartViewFiles).toHaveBeenCalledWith(mocks.db, "cad");
  });

  it("returns 404 for an unknown smart view", async () => {
    const route = await import("@/app/api/smart-views/[view]/route");

    const response = await route.GET(new Request("http://localhost/api/smart-views/missing"), {
      params: Promise.resolve({ view: "missing" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown smart view" });
    expect(mocks.listSmartViewFiles).not.toHaveBeenCalled();
  });

  it("creates projects with defaults", async () => {
    const route = await import("@/app/api/projects/route");

    const response = await route.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "NAS Project" })
      })
    );

    await expect(response.json()).resolves.toEqual({
      project: {
        id: "proj_123",
        name: "NAS Project",
        slug: "nas-project",
        description: "",
        categoryId: null,
        status: "active",
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      }
    });
    expect(response.status).toBe(201);
    expect(mocks.repo.createProject).toHaveBeenCalledWith({
      name: "NAS Project",
      description: "",
      categoryId: null
    });
  });

  it("returns 400 and skips createProject for invalid project schema", async () => {
    const route = await import("@/app/api/projects/route");

    const response = await route.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "" })
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "invalid project" });
    expect(response.status).toBe(400);
    expect(mocks.repo.createProject).not.toHaveBeenCalled();
  });

  it("returns 400 and skips createProject for malformed JSON", async () => {
    const route = await import("@/app/api/projects/route");

    const response = await route.POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: "{"
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "invalid project" });
    expect(response.status).toBe(400);
    expect(mocks.repo.createProject).not.toHaveBeenCalled();
  });
});
