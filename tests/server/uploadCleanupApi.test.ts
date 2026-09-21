import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMaintenanceAuth: vi.fn(),
  cleanupStaleUploads: vi.fn(),
  purgeExpiredAuthState: vi.fn()
}));

vi.mock("@/lib/server/auth/maintenance", () => ({ requireMaintenanceAuth: mocks.requireMaintenanceAuth }));
vi.mock("@/lib/server/uploadCleanup", () => ({ cleanupStaleUploads: mocks.cleanupStaleUploads }));
vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: () => ({ purgeExpiredAuthState: mocks.purgeExpiredAuthState })
}));

describe("upload cleanup maintenance endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: true });
    mocks.cleanupStaleUploads.mockResolvedValue({ scanned: 2, cleaned: 2 });
    mocks.purgeExpiredAuthState.mockReturnValue({ sessions: 1, pairingCodes: 0, rateLimitEvents: 4 });
  });

  it("also purges expired auth state, so cron-only deployments get it too", async () => {
    const { POST } = await import("@/app/api/maintenance/upload-cleanup/route");

    const response = await POST(new Request("http://localhost/api/maintenance/upload-cleanup", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 2,
      cleaned: 2,
      purged: { sessions: 1, pairingCodes: 0, rateLimitEvents: 4 }
    });
  });

  it("does nothing without maintenance auth", async () => {
    const { POST } = await import("@/app/api/maintenance/upload-cleanup/route");
    mocks.requireMaintenanceAuth.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
    });

    const response = await POST(new Request("http://localhost/api/maintenance/upload-cleanup", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.purgeExpiredAuthState).not.toHaveBeenCalled();
  });
});
