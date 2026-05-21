import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    listTags: vi.fn(),
    createTag: vi.fn(),
    getTagBySlug: vi.fn(),
    deleteTag: vi.fn()
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

describe("tags API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.repo.getTagBySlug.mockReturnValue(null);
  });

  it("lists tags", async () => {
    mocks.repo.listTags.mockReturnValue([{ id: "tag_1", name: "reference", slug: "reference" }]);
    const { GET } = await import("@/app/api/tags/route");

    const response = await GET(new Request("http://localhost/api/tags"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tags: [{ id: "tag_1", name: "reference", slug: "reference" }]
    });
  });

  it("creates a tag from a trimmed name", async () => {
    mocks.repo.createTag.mockReturnValue({ id: "tag_2", name: "Drafts", slug: "drafts" });
    const { POST } = await import("@/app/api/tags/route");

    const response = await POST(jsonRequest("http://localhost/api/tags", { name: "  Drafts  " }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      tag: { id: "tag_2", name: "Drafts", slug: "drafts" }
    });
    expect(mocks.repo.createTag).toHaveBeenCalledWith({ name: "Drafts" });
  });

  it("rejects an empty tag name", async () => {
    const { POST } = await import("@/app/api/tags/route");

    const response = await POST(jsonRequest("http://localhost/api/tags", { name: "   " }));

    expect(response.status).toBe(400);
    expect(mocks.repo.createTag).not.toHaveBeenCalled();
  });

  it("returns 409 when the slug already exists", async () => {
    mocks.repo.getTagBySlug.mockReturnValue({ id: "tag_existing", name: "Drafts", slug: "drafts" });
    const { POST } = await import("@/app/api/tags/route");

    const response = await POST(jsonRequest("http://localhost/api/tags", { name: "drafts" }));

    expect(response.status).toBe(409);
    expect(mocks.repo.createTag).not.toHaveBeenCalled();
  });

  it("deletes an existing tag", async () => {
    mocks.repo.deleteTag.mockReturnValue(true);
    const { DELETE } = await import("@/app/api/tags/[id]/route");

    const response = await DELETE(new Request("http://localhost/api/tags/tag_2", { method: "DELETE" }), {
      params: Promise.resolve({ id: "tag_2" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.repo.deleteTag).toHaveBeenCalledWith("tag_2");
  });

  it("returns 404 when the tag does not exist", async () => {
    mocks.repo.deleteTag.mockReturnValue(false);
    const { DELETE } = await import("@/app/api/tags/[id]/route");

    const response = await DELETE(new Request("http://localhost/api/tags/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" })
    });

    expect(response.status).toBe(404);
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
