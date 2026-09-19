import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMaintenanceAuth: vi.fn(),
  requireApiSession: vi.fn(),
  reconcileStorage: vi.fn(),
  getDatabase: vi.fn().mockReturnValue({ db: true }),
  repo: { countMissingFiles: vi.fn(), listMissingFiles: vi.fn() }
}));

vi.mock("@/lib/server/auth/maintenance", () => ({ requireMaintenanceAuth: mocks.requireMaintenanceAuth }));
vi.mock("@/lib/server/auth/guards", () => ({ requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/server/config", () => ({ appConfig: { storageRoot: "/mnt/nas-cloud" } }));
vi.mock("@/lib/server/db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/lib/server/indexer", () => ({ reconcileStorage: mocks.reconcileStorage }));
vi.mock("@/lib/server/metadata", () => ({ createMetadataRepository: () => mocks.repo }));

const unauthorized = () => ({ ok: false, response: new Response(null, { status: 401 }) });

describe("POST /api/maintenance/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: true, via: "session" });
  });

  it("runs a time-budgeted reconcile and returns its result", async () => {
    const result = { scanned: 9, indexed: 1, relinked: 2, restored: 0, missing: 1, deferred: 3 };
    mocks.reconcileStorage.mockResolvedValue(result);
    const { POST } = await import("@/app/api/maintenance/reconcile/route");

    const response = await POST(new Request("http://localhost/api/maintenance/reconcile", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.reconcileStorage).toHaveBeenCalledWith({
      db: { db: true },
      storageRoot: "/mnt/nas-cloud",
      budgetMs: 20_000
    });
  });

  it("reports an unavailable storage root instead of crashing", async () => {
    mocks.reconcileStorage.mockRejectedValue(new Error("Storage root is empty or unavailable"));
    const { POST } = await import("@/app/api/maintenance/reconcile/route");

    const response = await POST(new Request("http://localhost/api/maintenance/reconcile", { method: "POST" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Storage root is empty or unavailable" });
  });

  it("rejects unauthenticated callers without running", async () => {
    mocks.requireMaintenanceAuth.mockResolvedValue(unauthorized());
    const { POST } = await import("@/app/api/maintenance/reconcile/route");

    const response = await POST(new Request("http://localhost/api/maintenance/reconcile", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.reconcileStorage).not.toHaveBeenCalled();
  });
});

describe("GET /api/maintenance/reconcile/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true, userId: "user_1", sessionId: "s", deviceId: null });
  });

  it("returns the missing count and a trimmed list of missing files", async () => {
    mocks.repo.countMissingFiles.mockReturnValue(1);
    mocks.repo.listMissingFiles.mockReturnValue([
      { id: "file_1", name: "gone.stl", storagePath: "Inbox/Mac/gone.stl", checksum: "abc", tags: [] }
    ]);
    const { GET } = await import("@/app/api/maintenance/reconcile/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/reconcile/status"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      missingCount: 1,
      missingFiles: [{ id: "file_1", name: "gone.stl", storagePath: "Inbox/Mac/gone.stl" }]
    });
  });

  it("requires a session", async () => {
    mocks.requireApiSession.mockResolvedValue(unauthorized());
    const { GET } = await import("@/app/api/maintenance/reconcile/status/route");

    const response = await GET(new Request("http://localhost/api/maintenance/reconcile/status"));

    expect(response.status).toBe(401);
    expect(mocks.repo.listMissingFiles).not.toHaveBeenCalled();
  });
});
