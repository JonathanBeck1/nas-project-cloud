import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    searchFiles: vi.fn()
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

describe("search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.repo.searchFiles.mockReturnValue({ files: [], truncated: false });
  });

  it("requires authentication", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: false,
      response: new Response("unauth", { status: 401 })
    });
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?q=foo"));

    expect(response.status).toBe(401);
    expect(mocks.repo.searchFiles).not.toHaveBeenCalled();
  });

  it("forwards the query and reports results", async () => {
    mocks.repo.searchFiles.mockReturnValue({
      files: [{ id: "file_1", name: "foo.pdf" }],
      truncated: false
    });
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?q=foo"));

    expect(response.status).toBe(200);
    expect(mocks.repo.searchFiles).toHaveBeenCalledWith(
      expect.objectContaining({ query: "foo", includeArchived: false })
    );
    await expect(response.json()).resolves.toEqual({
      files: [{ id: "file_1", name: "foo.pdf" }],
      truncated: false,
      limit: 200
    });
  });

  it("composes filters across multiple query params", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new Request(
        "http://localhost/api/search?q=stl&family=cad&minBytes=1048576&maxBytes=104857600&projectId=proj_1&categoryId=cat_cad&tagId=tag_1"
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.repo.searchFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "stl",
        family: "cad",
        minBytes: 1048576,
        maxBytes: 104857600,
        projectId: "proj_1",
        categoryId: "cat_cad",
        tagId: "tag_1"
      })
    );
  });

  it("normalizes from/to into ISO strings", async () => {
    const { GET } = await import("@/app/api/search/route");

    await GET(new Request("http://localhost/api/search?from=2026-01-01&to=2026-12-31"));

    const args = mocks.repo.searchFiles.mock.calls[0][0];
    expect(args.from).toBe(new Date("2026-01-01").toISOString());
    expect(args.to).toBe(new Date("2026-12-31").toISOString());
  });

  it("rejects unknown family values", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?family=mystery"));

    expect(response.status).toBe(400);
    expect(mocks.repo.searchFiles).not.toHaveBeenCalled();
  });

  it("rejects non-numeric size filters", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?minBytes=lots"));

    expect(response.status).toBe(400);
    expect(mocks.repo.searchFiles).not.toHaveBeenCalled();
  });

  it("propagates the truncated flag from the repository", async () => {
    mocks.repo.searchFiles.mockReturnValue({ files: [], truncated: true });
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(new Request("http://localhost/api/search?q=anything"));

    await expect(response.json()).resolves.toEqual({ files: [], truncated: true, limit: 200 });
  });
});
