import { spawn, type SpawnOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const POSTER_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const MAX_POSTER_TIMESTAMP_S = 2;

export type VideoPosterInput = {
  absolutePath: string;
  outputJpegPath: string;
};

export type VideoPosterResult = {
  durationSeconds: number | null;
  posterTimestampSeconds: number;
};

type Spawner = typeof spawn;

/**
 * Probe the video duration with ffprobe and extract a single JPEG
 * frame at min(2s, duration*0.1). Both calls are time-bounded so a
 * weird container can't hang the worker indefinitely.
 *
 * Returns the timestamp the frame was taken at and the duration if
 * ffprobe reported one. Throws on any spawn or extraction failure
 * — the caller maps that to status: "failed".
 */
export async function generateVideoPoster(
  input: VideoPosterInput,
  spawner: Spawner = spawn
): Promise<VideoPosterResult> {
  const duration = await probeDuration(input.absolutePath, spawner);
  const timestamp = chooseTimestamp(duration);

  await fs.mkdir(path.dirname(input.outputJpegPath), { recursive: true });
  await runFfmpegFrame(input.absolutePath, input.outputJpegPath, timestamp, spawner);

  return { durationSeconds: duration, posterTimestampSeconds: timestamp };
}

export function chooseTimestamp(durationSeconds: number | null): number {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_POSTER_TIMESTAMP_S, durationSeconds * 0.1);
}

async function probeDuration(absolutePath: string, spawner: Spawner): Promise<number | null> {
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    absolutePath
  ];

  try {
    const { stdout } = await runWithTimeout("ffprobe", args, PROBE_TIMEOUT_MS, spawner);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function runFfmpegFrame(
  absolutePath: string,
  outputJpegPath: string,
  timestampSeconds: number,
  spawner: Spawner
): Promise<void> {
  const args = [
    "-y",
    "-ss",
    timestampSeconds.toString(),
    "-i",
    absolutePath,
    "-frames:v",
    "1",
    "-q:v",
    "5",
    outputJpegPath
  ];

  await runWithTimeout("ffmpeg", args, POSTER_TIMEOUT_MS, spawner);
}

type RunResult = { stdout: string; stderr: string };

function runWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
  spawner: Spawner
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const options: SpawnOptions = {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: os.tmpdir()
    };
    let child: ReturnType<Spawner>;

    try {
      child = spawner(command, args, options);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const tail = stderr.trim().split("\n").slice(-3).join(" | ");
        reject(new Error(`${command} exited with code ${code}${tail ? `: ${tail}` : ""}`));
      }
    });
  });
}
