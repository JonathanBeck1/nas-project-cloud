import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  scanStorageRoot: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({})
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/indexer", () => ({ scanStorageRoot: mocks.scanStorageRoot }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));

describe("reindex maintenance API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      userId: "user_1",
      sessionId: "session_1",
      deviceId: "device_1"
    });
    mocks.scanStorageRoot.mockResolvedValue({ scanned: 12, indexed: 4 });
  });

  it("rebuilds the index and returns the counts", async () => {
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const response = await POST(
      new Request("http://localhost/api/maintenance/reindex", { method: "POST" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ scanned: 12, indexed: 4 });
    expect(mocks.scanStorageRoot).toHaveBeenCalledTimes(1);
  });

  it("requires authentication", async () => {
    const authResponse = Response.json({ error: "authentication required" }, { status: 401 });
    mocks.requireApiSession.mockResolvedValue({ ok: false, response: authResponse });
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const response = await POST(
      new Request("http://localhost/api/maintenance/reindex", { method: "POST" })
    );

    expect(response.status).toBe(401);
    expect(mocks.scanStorageRoot).not.toHaveBeenCalled();
  });

  it("is single-flight: a concurrent call joins the run in progress", async () => {
    let release: (value: { scanned: number; indexed: number }) => void = () => {};
    mocks.scanStorageRoot.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const first = POST(new Request("http://localhost/api/maintenance/reindex", { method: "POST" }));
    const second = POST(new Request("http://localhost/api/maintenance/reindex", { method: "POST" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    release({ scanned: 7, indexed: 1 });

    const [firstBody, secondBody] = await Promise.all([
      first.then((response) => response.json()),
      second.then((response) => response.json())
    ]);

    expect(mocks.scanStorageRoot).toHaveBeenCalledTimes(1);
    expect(firstBody).toEqual({ scanned: 7, indexed: 1 });
    expect(secondBody).toEqual({ scanned: 7, indexed: 1 });
  });

  it("starts a fresh scan once the previous one finished", async () => {
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    await POST(new Request("http://localhost/api/maintenance/reindex", { method: "POST" }));
    await POST(new Request("http://localhost/api/maintenance/reindex", { method: "POST" }));

    expect(mocks.scanStorageRoot).toHaveBeenCalledTimes(2);
  });
});
