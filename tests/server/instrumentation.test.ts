import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: { previewScheduler: "on", dbPath: "/data/nas-cloud.sqlite" },
  requeueStalePreviewJobs: vi.fn(() => ({ requeued: 0, failed: 0 })),
  purgeExpiredAuthState: vi.fn(() => ({ sessions: 0, pairingCodes: 0, rateLimitEvents: 0 })),
  countUsers: vi.fn(() => 1),
  getOrCreateSetupCode: vi.fn(() => "ABCDEFGHJKMN"),
  startPreviewScheduler: vi.fn(),
  startReconcileScheduler: vi.fn(),
  cleanupStaleUploads: vi.fn(async () => undefined),
  sweepOrphanPreviews: vi.fn(async () => ({ removed: 0 })),
  backupDatabase: vi.fn(async () => ({ created: null, removed: 0 }))
}));

vi.mock("@/lib/server/config", () => ({ getAppConfig: () => mocks.config }));
vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: () => ({
    requeueStalePreviewJobs: mocks.requeueStalePreviewJobs,
    purgeExpiredAuthState: mocks.purgeExpiredAuthState,
    countUsers: mocks.countUsers,
    getOrCreateSetupCode: mocks.getOrCreateSetupCode
  })
}));
vi.mock("@/lib/server/previews/scheduler", () => ({ startPreviewScheduler: mocks.startPreviewScheduler }));
vi.mock("@/lib/server/reconcileScheduler", () => ({ startReconcileScheduler: mocks.startReconcileScheduler }));
vi.mock("@/lib/server/uploadCleanup", () => ({ cleanupStaleUploads: mocks.cleanupStaleUploads }));
vi.mock("@/lib/server/previews/cleanup", () => ({ sweepOrphanPreviews: mocks.sweepOrphanPreviews }));
vi.mock("@/lib/server/backup", () => ({ backupDatabase: mocks.backupDatabase }));

describe("node instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("requeues interrupted previews at boot and hands upload cleanup to the scheduler", async () => {
    mocks.config.previewScheduler = "on";

    await import("@/instrumentation-node");

    expect(mocks.requeueStalePreviewJobs).toHaveBeenCalledTimes(1);
    expect(mocks.purgeExpiredAuthState).toHaveBeenCalledTimes(1);
    const { runHourlyMaintenance } = mocks.startPreviewScheduler.mock.calls[0][0];
    await runHourlyMaintenance();
    expect(mocks.cleanupStaleUploads).toHaveBeenCalledWith({ olderThan: expect.any(Date) });
    expect(mocks.purgeExpiredAuthState).toHaveBeenCalledTimes(2);
    expect(mocks.sweepOrphanPreviews).toHaveBeenCalledTimes(1);
    expect(mocks.backupDatabase).toHaveBeenCalledWith({ db: {}, dbPath: "/data/nas-cloud.sqlite" });
  });

  it("still requeues interrupted previews when the scheduler is off", async () => {
    mocks.config.previewScheduler = "off";

    await import("@/instrumentation-node");

    expect(mocks.requeueStalePreviewJobs).toHaveBeenCalledTimes(1);
    expect(mocks.purgeExpiredAuthState).toHaveBeenCalledTimes(1);
    expect(mocks.startPreviewScheduler).not.toHaveBeenCalled();
    expect(mocks.startReconcileScheduler).not.toHaveBeenCalled();
  });

  it("prints the setup code while no owner exists", async () => {
    mocks.countUsers.mockReturnValueOnce(0);

    await import("@/instrumentation-node");

    expect(console.log).toHaveBeenCalledWith(
      "[setup] No owner yet. Enter this setup code on the setup page: ABCD-EFGH-JKMN"
    );
  });

  it("prints no setup code once an owner exists", async () => {
    await import("@/instrumentation-node");

    expect(mocks.getOrCreateSetupCode).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("[setup]"));
  });

  it("starts storage sync alongside the preview scheduler", async () => {
    mocks.config.previewScheduler = "on";

    await import("@/instrumentation-node");

    expect(mocks.startReconcileScheduler).toHaveBeenCalledTimes(1);
  });
});
