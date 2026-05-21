import { spawn } from "node:child_process";

export type FfmpegProbeResult = {
  available: boolean;
  version?: string;
  error?: string;
};

type Spawner = typeof spawn;

let cachedProbe: Promise<FfmpegProbeResult> | null = null;

/**
 * Run `ffmpeg -version` once and cache the outcome for the lifetime
 * of the process. Never throws; a missing or broken binary returns
 * `{ available: false }` with an error string the worker can record.
 */
export function probeFfmpeg(spawner: Spawner = spawn): Promise<FfmpegProbeResult> {
  if (cachedProbe) {
    return cachedProbe;
  }

  cachedProbe = runProbe(spawner);
  return cachedProbe;
}

/** For tests: drop the cached probe so the next call re-runs the spawn. */
export function resetFfmpegProbeCacheForTesting(): void {
  cachedProbe = null;
}

function runProbe(spawner: Spawner): Promise<FfmpegProbeResult> {
  return new Promise((resolve) => {
    let child: ReturnType<Spawner>;
    try {
      child = spawner("ffmpeg", ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolve({ available: false, error: messageOf(error) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: FfmpegProbeResult) => {
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
      if (code === 0) {
        settle({ available: true, version: parseVersion(stdout) });
      } else {
        settle({
          available: false,
          error: `ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`
        });
      }
    });
  });
}

function parseVersion(stdout: string): string | undefined {
  const match = /^ffmpeg version (\S+)/m.exec(stdout);
  return match?.[1];
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
