import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  runPreviewWorker: vi.fn(),
  resetFailedPreviews: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({}),
  createMetadataRepository: vi.fn()
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/previews/worker", () => ({ runPreviewWorker: mocks.runPreviewWorker }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: mocks.createMetadataRepository
}));

describe("preview maintenance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.runPreviewWorker.mockResolvedValue({ scanned: 2, processed: 2, failed: 0 });
    mocks.resetFailedPreviews.mockReturnValue(0);
    mocks.createMetadataRepository.mockReturnValue({
      resetFailedPreviews: mocks.resetFailedPreviews
    });
  });

  it("runs pending preview jobs with the requested limit", async () => {
    const { POST } = await import("@/app/api/maintenance/previews/route");

    const response = await POST(
      new Request("http://localhost/api/maintenance/previews", {
        method: "POST",
        body: JSON.stringify({ limit: 5 })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { scanned: 2, processed: 2, failed: 0 },
      resetCount: 0
    });
    expect(mocks.runPreviewWorker).toHaveBeenCalledWith({ limit: 5 });
    expect(mocks.resetFailedPreviews).not.toHaveBeenCalled();
  });

  it("requeues failed previews when retryFailed is true and includes the count", async () => {
    mocks.resetFailedPreviews.mockReturnValue(3);
    const { POST } = await import("@/app/api/maintenance/previews/route");

    const response = await POST(
      new Request("http://localhost/api/maintenance/previews", {
        method: "POST",
        body: JSON.stringify({ retryFailed: true, limit: 100 })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: { scanned: 2, processed: 2, failed: 0 },
      resetCount: 3
    });
    expect(mocks.resetFailedPreviews).toHaveBeenCalledTimes(1);
    expect(mocks.runPreviewWorker).toHaveBeenCalledWith({ limit: 100 });
  });

  it("requires an authenticated owner session", async () => {
    const authResponse = Response.json({ error: "authentication required" }, { status: 401 });
    mocks.requireApiSession.mockResolvedValue({ ok: false, response: authResponse });
    const { POST } = await import("@/app/api/maintenance/previews/route");

    const response = await POST(new Request("http://localhost/api/maintenance/previews", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.runPreviewWorker).not.toHaveBeenCalled();
    expect(mocks.resetFailedPreviews).not.toHaveBeenCalled();
  });
});
