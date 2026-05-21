import { spawn } from "node:child_process";

export type PopplerProbeResult = {
  available: boolean;
  version?: string;
  error?: string;
};

type Spawner = typeof spawn;

let cachedProbe: Promise<PopplerProbeResult> | null = null;

/**
 * Run `pdftoppm -v` once and cache the outcome for the lifetime of
 * the process. Never throws; a missing or broken binary returns
 * `{ available: false }` with an error string the worker can record
 * as a `status: "unsupported"` reason.
 *
 * `pdftoppm` writes its banner to stderr (not stdout, like `ffmpeg`),
 * which is why this helper exists as its own module rather than as
 * a generic spawnProbe utility shared with ffmpeg.
 */
export function probePoppler(spawner: Spawner = spawn): Promise<PopplerProbeResult> {
  if (cachedProbe) {
    return cachedProbe;
  }
  cachedProbe = runProbe(spawner);
  return cachedProbe;
}

/** For tests: drop the cached probe so the next call re-runs the spawn. */
export function resetPopplerProbeCacheForTesting(): void {
  cachedProbe = null;
}

function runProbe(spawner: Spawner): Promise<PopplerProbeResult> {
  return new Promise((resolve) => {
    let child: ReturnType<Spawner>;
    try {
      child = spawner("pdftoppm", ["-v"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ available: false, error: messageOf(error) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: PopplerProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => settle({ available: false, error: messageOf(error) }));
    child.on("close", (code) => {
      // pdftoppm -v exits with 0 and prints to stderr like:
      //   pdftoppm version 23.04.0
      //   Copyright 2005-...
      if (code === 0 || code === null) {
        settle({ available: true, version: parseVersion(stderr) ?? parseVersion(stdout) });
      } else {
        settle({
          available: false,
          error: `pdftoppm exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`
        });
      }
    });
  });
}

function parseVersion(text: string): string | undefined {
  const match = /pdftoppm version (\S+)/i.exec(text);
  return match?.[1];
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
