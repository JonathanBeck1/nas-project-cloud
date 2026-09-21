import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { runWithTimeout, type Spawner } from "./runWithTimeout";

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
    "-protocol_whitelist",
    "file",
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
  // The whitelist keeps a playlist posing as a video from pulling in network or concat sources.
  const args = [
    "-nostdin",
    "-y",
    "-protocol_whitelist",
    "file",
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
