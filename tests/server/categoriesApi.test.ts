import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  repo: {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    getCategoryBySlug: vi.fn(),
    getCategoryById: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn()
  },
  requireApiSession: vi.fn(),
  SystemCategoryError: class extends Error {
    constructor(message?: string) {
      super(message ?? "system");
      this.name = "SystemCategoryError";
    }
  }
}));

vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => mocks.db) }));
vi.mock("@/lib/server/metadata", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/metadata")>();
  return {
    ...original,
    createMetadataRepository: vi.fn(() => mocks.repo),
    SystemCategoryError: mocks.SystemCategoryError
  };
});
vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));

const customCategory = {
  id: "cat_custom",
  name: "Reference",
  slug: "reference",
  color: "#0F62FE",
  isSystem: false,
  sortOrder: 100
};

describe("categories API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.repo.getCategoryBySlug.mockReturnValue(null);
  });

  it("creates a custom category with a hex color", async () => {
    mocks.repo.createCategory.mockReturnValue(customCategory);
    const { POST } = await import("@/app/api/categories/route");

    const response = await POST(
      jsonRequest("http://localhost/api/categories", { name: "  Reference  ", color: "#0F62FE" })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ category: customCategory });
    expect(mocks.repo.createCategory).toHaveBeenCalledWith({ name: "Reference", color: "#0F62FE" });
  });

  it("rejects invalid colors", async () => {
    const { POST } = await import("@/app/api/categories/route");

    const response = await POST(
      jsonRequest("http://localhost/api/categories", { name: "Reference", color: "blue" })
    );

    expect(response.status).toBe(400);
    expect(mocks.repo.createCategory).not.toHaveBeenCalled();
  });

  it("returns 409 when the slug already exists", async () => {
    mocks.repo.getCategoryBySlug.mockReturnValue(customCategory);
    const { POST } = await import("@/app/api/categories/route");

    const response = await POST(
      jsonRequest("http://localhost/api/categories", { name: "Reference", color: "#000000" })
    );

    expect(response.status).toBe(409);
    expect(mocks.repo.createCategory).not.toHaveBeenCalled();
  });

  it("updates the name and color of a custom category", async () => {
    const updated = { ...customCategory, name: "References", color: "#42BE65" };
    mocks.repo.updateCategory.mockReturnValue(updated);
    const { PATCH } = await import("@/app/api/categories/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/categories/cat_custom", {
        name: "References",
        color: "#42BE65"
      }),
      { params: Promise.resolve({ id: "cat_custom" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ category: updated });
    expect(mocks.repo.updateCategory).toHaveBeenCalledWith("cat_custom", {
      name: "References",
      color: "#42BE65"
    });
  });

  it("returns 409 when trying to PATCH a system category", async () => {
    mocks.repo.updateCategory.mockImplementation(() => {
      throw new mocks.SystemCategoryError();
    });
    const { PATCH } = await import("@/app/api/categories/[id]/route");

    const response = await PATCH(
      jsonRequest("http://localhost/api/categories/cat_inbox", { name: "Inbox renamed" }),
      { params: Promise.resolve({ id: "cat_inbox" }) }
    );

    expect(response.status).toBe(409);
  });

  it("deletes a custom category", async () => {
    mocks.repo.deleteCategory.mockReturnValue(true);
    const { DELETE } = await import("@/app/api/categories/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/categories/cat_custom", { method: "DELETE" }),
      { params: Promise.resolve({ id: "cat_custom" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.repo.deleteCategory).toHaveBeenCalledWith("cat_custom");
  });

  it("returns 409 when trying to delete a system category", async () => {
    mocks.repo.deleteCategory.mockImplementation(() => {
      throw new mocks.SystemCategoryError();
    });
    const { DELETE } = await import("@/app/api/categories/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/categories/cat_inbox", { method: "DELETE" }),
      { params: Promise.resolve({ id: "cat_inbox" }) }
    );

    expect(response.status).toBe(409);
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
