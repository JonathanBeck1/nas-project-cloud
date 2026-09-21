import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: { previewScheduler: "on" },
  requeueStalePreviewJobs: vi.fn(() => ({ requeued: 0, failed: 0 })),
  purgeExpiredAuthState: vi.fn(() => ({ sessions: 0, pairingCodes: 0, rateLimitEvents: 0 })),
  startPreviewScheduler: vi.fn(),
  cleanupStaleUploads: vi.fn(async () => undefined)
}));

vi.mock("@/lib/server/config", () => ({ getAppConfig: () => mocks.config }));
vi.mock("@/lib/server/db", () => ({ getDatabase: vi.fn(() => ({})) }));
vi.mock("@/lib/server/metadata", () => ({
  createMetadataRepository: () => ({
    requeueStalePreviewJobs: mocks.requeueStalePreviewJobs,
    purgeExpiredAuthState: mocks.purgeExpiredAuthState
  })
}));
vi.mock("@/lib/server/previews/scheduler", () => ({ startPreviewScheduler: mocks.startPreviewScheduler }));
vi.mock("@/lib/server/uploadCleanup", () => ({ cleanupStaleUploads: mocks.cleanupStaleUploads }));

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
  });

  it("still requeues interrupted previews when the scheduler is off", async () => {
    mocks.config.previewScheduler = "off";

    await import("@/instrumentation-node");

    expect(mocks.requeueStalePreviewJobs).toHaveBeenCalledTimes(1);
    expect(mocks.purgeExpiredAuthState).toHaveBeenCalledTimes(1);
    expect(mocks.startPreviewScheduler).not.toHaveBeenCalled();
  });
});
