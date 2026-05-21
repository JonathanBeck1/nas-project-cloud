import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeFfmpeg, resetFfmpegProbeCacheForTesting } from "@/lib/server/previews/ffmpeg";

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
};

function makeChild(): FakeChild {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn()
  });
  return child as FakeChild;
}

describe("probeFfmpeg", () => {
  beforeEach(() => {
    resetFfmpegProbeCacheForTesting();
  });

  afterEach(() => {
    resetFfmpegProbeCacheForTesting();
  });

  it("returns available with parsed version when ffmpeg exits 0", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probeFfmpeg(spawner);
    child.stdout.emit("data", Buffer.from("ffmpeg version 6.0 Copyright (c) 2000-2023\n"));
    child.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(true);
    expect(result.version).toBe("6.0");
  });

  it("returns unavailable with stderr context when ffmpeg exits non-zero", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probeFfmpeg(spawner);
    child.stderr.emit("data", Buffer.from("permission denied\n"));
    child.emit("close", 1);

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  it("returns unavailable when spawn fires an error event (binary missing)", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probeFfmpeg(spawner);
    child.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("returns unavailable when spawn itself throws synchronously", async () => {
    const spawner = vi.fn(() => {
      throw new Error("spawn EACCES");
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await probeFfmpeg(spawner);
    expect(result.available).toBe(false);
    expect(result.error).toContain("EACCES");
  });

  it("memoizes the result for the lifetime of the process", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const first = probeFfmpeg(spawner);
    child.stdout.emit("data", Buffer.from("ffmpeg version 6.0\n"));
    child.emit("close", 0);
    await first;

    const second = await probeFfmpeg(spawner);
    expect(second.available).toBe(true);
    expect(spawner).toHaveBeenCalledTimes(1);
  });
});
