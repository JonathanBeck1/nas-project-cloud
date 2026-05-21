import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probePoppler, resetPopplerProbeCacheForTesting } from "@/lib/server/previews/poppler";

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

describe("probePoppler", () => {
  beforeEach(() => {
    resetPopplerProbeCacheForTesting();
  });

  afterEach(() => {
    resetPopplerProbeCacheForTesting();
  });

  it("parses the version from stderr (pdftoppm prints there) when exit is 0", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probePoppler(spawner);
    child.stderr.emit("data", Buffer.from("pdftoppm version 23.04.0\nCopyright 2005-2023\n"));
    child.emit("close", 0);

    const result = await promise;
    expect(result.available).toBe(true);
    expect(result.version).toBe("23.04.0");
  });

  it("treats null exit code as available (some poppler builds exit on signal)", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probePoppler(spawner);
    child.stderr.emit("data", Buffer.from("pdftoppm version 22.12.0\n"));
    child.emit("close", null);

    const result = await promise;
    expect(result.available).toBe(true);
    expect(result.version).toBe("22.12.0");
  });

  it("returns unavailable when spawn fires an error event (binary missing)", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probePoppler(spawner);
    child.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("returns unavailable on non-zero exit, preserving stderr context", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const promise = probePoppler(spawner);
    child.stderr.emit("data", Buffer.from("permission denied\n"));
    child.emit("close", 1);

    const result = await promise;
    expect(result.available).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  it("memoizes the probe across multiple callers", async () => {
    const child = makeChild();
    const spawner = vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;

    const first = probePoppler(spawner);
    child.stderr.emit("data", Buffer.from("pdftoppm version 23.0.0\n"));
    child.emit("close", 0);
    await first;

    await probePoppler(spawner);
    expect(spawner).toHaveBeenCalledTimes(1);
  });
});
