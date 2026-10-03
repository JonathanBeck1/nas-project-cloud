import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  reconcileStorage: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({}),
  countMissingFiles: vi.fn(),
  listMissingFiles: vi.fn()
}));

vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/indexer", () => ({ reconcileStorage: mocks.reconcileStorage }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: () => ({ countMissingFiles: mocks.countMissingFiles, listMissingFiles: mocks.listMissingFiles })
}));

const counts = { scanned: 12, indexed: 4, relinked: 1, restored: 0, missing: 2, deferred: 0 };
const post = () => new Request("http://localhost/api/maintenance/reindex", { method: "POST" });

describe("reindex maintenance API (storage sync)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true, userId: "user_1", sessionId: "session_1", deviceId: "device_1" });
    mocks.reconcileStorage.mockResolvedValue(counts);
    mocks.countMissingFiles.mockReturnValue(1);
    mocks.listMissingFiles.mockReturnValue([
      { id: "file_1", name: "gone.stl", storagePath: "Inbox/Mac/gone.stl", sizeBytes: 4, checksum: "abc" }
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("syncs the index with the disk within a time budget and returns the counts", async () => {
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const response = await POST(post());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(counts);
    expect(mocks.reconcileStorage).toHaveBeenCalledWith(expect.objectContaining({ budgetMs: 20_000 }));
  });

  it("requires authentication", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "authentication required" }, { status: 401 })
    });
    const { GET, POST } = await import("@/app/api/maintenance/reindex/route");

    expect((await POST(post())).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/maintenance/reindex"))).status).toBe(401);
    expect(mocks.reconcileStorage).not.toHaveBeenCalled();
  });

  it("is single-flight: a concurrent call joins the run in progress", async () => {
    let release: (value: typeof counts) => void = () => {};
    mocks.reconcileStorage.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const first = POST(post());
    const second = POST(post());
    await new Promise((resolve) => setTimeout(resolve, 0));
    release({ ...counts, indexed: 1 });

    const bodies = await Promise.all([first, second].map((response) => response.then((r) => r.json())));
    expect(mocks.reconcileStorage).toHaveBeenCalledTimes(1);
    expect(bodies).toEqual([
      { ...counts, indexed: 1 },
      { ...counts, indexed: 1 }
    ]);
  });

  it("starts a fresh run once the previous one finished", async () => {
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    await POST(post());
    await POST(post());

    expect(mocks.reconcileStorage).toHaveBeenCalledTimes(2);
  });

  it("answers 202 when the run outlasts the request, and leaves it running", async () => {
    vi.useFakeTimers();
    mocks.reconcileStorage.mockImplementation(() => new Promise(() => undefined));
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const pending = POST(post());
    await vi.advanceTimersByTimeAsync(25_000);
    const response = await pending;

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ running: true });
  });

  it("explains a refused sync", async () => {
    mocks.reconcileStorage.mockRejectedValue(new Error("Storage root is empty or unavailable"));
    const { POST } = await import("@/app/api/maintenance/reindex/route");

    const response = await POST(post());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Storage root is empty or unavailable" });
  });

  it("lists missing files for the Settings card", async () => {
    const { GET } = await import("@/app/api/maintenance/reindex/route");

    const response = await GET(new Request("http://localhost/api/maintenance/reindex"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      missingCount: 1,
      missingFiles: [{ id: "file_1", name: "gone.stl", storagePath: "Inbox/Mac/gone.stl" }]
    });
  });
});
