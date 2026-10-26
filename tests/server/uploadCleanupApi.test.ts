import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMaintenanceAuth: vi.fn(),
  cleanupStaleUploads: vi.fn(),
  purgeExpiredAuthState: vi.fn(),
  pruneAuditEvents: vi.fn(),
  sweepOrphanPreviews: vi.fn(),
  backupDatabase: vi.fn()
}));

vi.mock("@/lib/server/auth/maintenance", () => ({ requireMaintenanceAuth: mocks.requireMaintenanceAuth }));
vi.mock("@/lib/server/uploadCleanup", () => ({ cleanupStaleUploads: mocks.cleanupStaleUploads }));
vi.mock("@/lib/server/previews/cleanup", () => ({ sweepOrphanPreviews: mocks.sweepOrphanPreviews }));
vi.mock("@/lib/server/backup", () => ({ backupDatabase: mocks.backupDatabase }));
vi.mock("@/lib/server/config", () => ({ getAppConfig: () => ({ dbPath: "/data/nas-cloud.sqlite" }) }));
vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: () => ({
    purgeExpiredAuthState: mocks.purgeExpiredAuthState,
    pruneAuditEvents: mocks.pruneAuditEvents
  })
}));

describe("upload cleanup maintenance endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMaintenanceAuth.mockResolvedValue({ ok: true });
    mocks.cleanupStaleUploads.mockResolvedValue({ scanned: 2, cleaned: 2 });
    mocks.purgeExpiredAuthState.mockReturnValue({ sessions: 1, pairingCodes: 0, rateLimitEvents: 4 });
    mocks.pruneAuditEvents.mockReturnValue(5);
    mocks.sweepOrphanPreviews.mockResolvedValue({ removed: 3 });
    mocks.backupDatabase.mockResolvedValue({ created: "/data/backups/nas-cloud-2026-10-02.sqlite", removed: 1 });
  });

  it("also purges expired auth state, old audit entries and orphan previews and takes the daily backup, so cron-only deployments get them too", async () => {
    const { POST } = await import("@/app/api/maintenance/upload-cleanup/route");

    const response = await POST(new Request("http://localhost/api/maintenance/upload-cleanup", { method: "POST" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      scanned: 2,
      cleaned: 2,
      purged: { sessions: 1, pairingCodes: 0, rateLimitEvents: 4 },
      auditEventsPruned: 5,
      previews: { removed: 3 },
      backup: { created: "/data/backups/nas-cloud-2026-10-02.sqlite", removed: 1 }
    });
    expect(mocks.backupDatabase).toHaveBeenCalledWith({ db: {}, dbPath: "/data/nas-cloud.sqlite" });
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
    expect(mocks.sweepOrphanPreviews).not.toHaveBeenCalled();
    expect(mocks.backupDatabase).not.toHaveBeenCalled();
  });
});
