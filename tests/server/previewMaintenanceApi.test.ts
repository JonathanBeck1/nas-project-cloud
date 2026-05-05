import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  runPreviewWorker: vi.fn()
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/previews/worker", () => ({ runPreviewWorker: mocks.runPreviewWorker }));

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
    await expect(response.json()).resolves.toEqual({ result: { scanned: 2, processed: 2, failed: 0 } });
    expect(mocks.runPreviewWorker).toHaveBeenCalledWith({ limit: 5 });
  });

  it("requires an authenticated owner session", async () => {
    const authResponse = Response.json({ error: "authentication required" }, { status: 401 });
    mocks.requireApiSession.mockResolvedValue({ ok: false, response: authResponse });
    const { POST } = await import("@/app/api/maintenance/previews/route");

    const response = await POST(new Request("http://localhost/api/maintenance/previews", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.runPreviewWorker).not.toHaveBeenCalled();
  });
});
