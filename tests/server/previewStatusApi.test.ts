import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  countFilePreviewsByStatus: vi.fn(),
  lastSuccessfulPreviewAt: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({}),
  createMetadataRepository: vi.fn()
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: mocks.createMetadataRepository
}));

describe("preview status API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.countFilePreviewsByStatus.mockReturnValue({ pending: 4, ready: 12, failed: 1, skipped: 7 });
    mocks.lastSuccessfulPreviewAt.mockReturnValue("2026-05-20T12:34:56.000Z");
    mocks.createMetadataRepository.mockReturnValue({
      countFilePreviewsByStatus: mocks.countFilePreviewsByStatus,
      lastSuccessfulPreviewAt: mocks.lastSuccessfulPreviewAt
    });
  });

  it("returns counts and the last ready timestamp for an authenticated session", async () => {
    const { GET } = await import("@/app/api/maintenance/previews/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/previews/status"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      counts: { pending: 4, ready: 12, failed: 1, skipped: 7 },
      lastReadyAt: "2026-05-20T12:34:56.000Z"
    });
  });

  it("requires an authenticated session", async () => {
    const authResponse = Response.json({ error: "authentication required" }, { status: 401 });
    mocks.requireApiSession.mockResolvedValue({ ok: false, response: authResponse });
    const { GET } = await import("@/app/api/maintenance/previews/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/previews/status"));

    expect(response.status).toBe(401);
    expect(mocks.countFilePreviewsByStatus).not.toHaveBeenCalled();
  });
});
