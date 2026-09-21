import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetPreviewSchedulerForTesting,
  startPreviewScheduler,
  type PreviewSchedulerHandle
} from "@/lib/server/previews/scheduler";

const ACTIVE_MS = 60_000;
const IDLE_MS = 5 * 60_000;

describe("preview scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPreviewSchedulerForTesting();
  });

  afterEach(async () => {
    vi.useRealTimers();
    resetPreviewSchedulerForTesting();
  });

  it("runs the worker on the active interval when there is pending work", async () => {
    const runWorker = vi
      .fn()
      .mockResolvedValueOnce({ scanned: 3, processed: 3, failed: 0 })
      .mockResolvedValueOnce({ scanned: 2, processed: 2, failed: 0 })
      .mockResolvedValue({ scanned: 0, processed: 0, failed: 0 });

    const handle = startPreviewScheduler({ runWorker });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(2);

    await stopAndFlush(handle);
  });

  it("backs off to the idle interval when a tick finds zero work", async () => {
    const runWorker = vi.fn().mockResolvedValue({ scanned: 0, processed: 0, failed: 0 });

    const handle = startPreviewScheduler({ runWorker });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IDLE_MS - ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(2);

    await stopAndFlush(handle);
  });

  it("never overlaps two ticks", async () => {
    let inflight = 0;
    let observedMaxInflight = 0;
    const runWorker = vi.fn(async () => {
      inflight += 1;
      observedMaxInflight = Math.max(observedMaxInflight, inflight);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      inflight -= 1;
      return { scanned: 5, processed: 5, failed: 0 };
    });

    const handle = startPreviewScheduler({ runWorker });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    await vi.advanceTimersByTimeAsync(ACTIVE_MS);

    expect(observedMaxInflight).toBe(1);

    await stopAndFlush(handle);
  });

  it("returns the existing handle on a second start call", () => {
    const runWorker = vi.fn().mockResolvedValue({ scanned: 0, processed: 0, failed: 0 });
    const first = startPreviewScheduler({ runWorker });
    const second = startPreviewScheduler({ runWorker });

    expect(second).toBe(first);
  });

  it("stop() cancels future ticks and waits for any in-flight run", async () => {
    type WorkerResult = { scanned: number; processed: number; failed: number };
    const resolvers: Array<(value: WorkerResult) => void> = [];
    const runWorker = vi.fn(
      () =>
        new Promise<WorkerResult>((resolve) => {
          resolvers.push(resolve);
        })
    );

    const handle = startPreviewScheduler({ runWorker });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(1);

    const stopPromise = handle.stop();
    resolvers[0]?.({ scanned: 1, processed: 1, failed: 0 });
    await stopPromise;

    await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
    expect(runWorker).toHaveBeenCalledTimes(1);
  });

  it("swallows worker errors and reports them via onError", async () => {
    const error = new Error("boom");
    const runWorker = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const handle = startPreviewScheduler({ runWorker, onError });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(onError).toHaveBeenCalledWith(error);

    await vi.advanceTimersByTimeAsync(IDLE_MS);
    expect(runWorker).toHaveBeenCalledTimes(2);

    await stopAndFlush(handle);
  });

  it("schedules the next tick promptly after a full batch", async () => {
    const runWorker = vi
      .fn()
      .mockResolvedValueOnce({ scanned: 25, processed: 25, failed: 0 })
      .mockResolvedValue({ scanned: 0, processed: 0, failed: 0 });

    const handle = startPreviewScheduler({ runWorker });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runWorker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(runWorker).toHaveBeenCalledTimes(2);

    await stopAndFlush(handle);
  });

  it("runs upload cleanup on the first tick and then hourly", async () => {
    const runWorker = vi.fn().mockResolvedValue({ scanned: 1, processed: 1, failed: 0 });
    const runUploadCleanup = vi.fn().mockResolvedValue(undefined);

    const handle = startPreviewScheduler({ runWorker, runUploadCleanup });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(runUploadCleanup).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 10);
    expect(runUploadCleanup).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(runUploadCleanup).toHaveBeenCalledTimes(2);

    await stopAndFlush(handle);
  });

  it("still runs the worker when upload cleanup fails", async () => {
    const error = new Error("cleanup boom");
    const runWorker = vi.fn().mockResolvedValue({ scanned: 0, processed: 0, failed: 0 });
    const runUploadCleanup = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const handle = startPreviewScheduler({ runWorker, runUploadCleanup, onError });

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    expect(onError).toHaveBeenCalledWith(error);
    expect(runWorker).toHaveBeenCalledTimes(1);

    await stopAndFlush(handle);
  });
});

async function stopAndFlush(handle: PreviewSchedulerHandle): Promise<void> {
  const stopPromise = handle.stop();
  await vi.runOnlyPendingTimersAsync();
  await stopPromise;
}
