import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetReconcileSchedulerForTesting, startReconcileScheduler } from "@/lib/server/reconcileScheduler";

const FIRST_RUN_MS = 60_000;
const INTERVAL_MS = 15 * 60_000;

describe("storage sync scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetReconcileSchedulerForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetReconcileSchedulerForTesting();
  });

  it("runs a minute after start, then every fifteen minutes", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = startReconcileScheduler(run);

    await vi.advanceTimersByTimeAsync(FIRST_RUN_MS - 1);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("waits for a long run to finish before scheduling the next one", async () => {
    let finish!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockResolvedValue(undefined);
    const handle = startReconcileScheduler(run);

    await vi.advanceTimersByTimeAsync(FIRST_RUN_MS + INTERVAL_MS * 4);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("keeps going after a failed run", async () => {
    const onError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn().mockRejectedValueOnce(new Error("storage root unavailable")).mockResolvedValue(undefined);
    const handle = startReconcileScheduler(run);

    await vi.advanceTimersByTimeAsync(FIRST_RUN_MS + INTERVAL_MS);

    expect(run).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("is a singleton and stops cleanly", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const handle = startReconcileScheduler(run);

    expect(startReconcileScheduler(run)).toBe(handle);
    await vi.advanceTimersByTimeAsync(FIRST_RUN_MS);
    expect(run).toHaveBeenCalledTimes(1);

    handle.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
