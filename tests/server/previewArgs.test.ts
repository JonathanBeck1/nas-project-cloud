import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPdfFirstPage } from "@/lib/server/previews/pdf";
import { generateVideoPoster } from "@/lib/server/previews/video";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function recordingSpawner() {
  const calls: { command: string; args: string[] }[] = [];
  const spawner = vi.fn((command: string, args: string[]) => {
    calls.push({ command, args });
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn()
    });
    setImmediate(() => {
      child.stdout.emit("data", "3.0\n");
      child.emit("close", 0);
    });
    return child;
  }) as unknown as typeof spawn;
  return { spawner, calls };
}

describe("preview command arguments", () => {
  it("caps the rendered PDF page by pixels, not by resolution", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-args-"));
    createdDirs.push(dir);
    const { spawner, calls } = recordingSpawner();

    await renderPdfFirstPage({ absolutePath: "/in/plot.pdf", outputPngPath: path.join(dir, "page.png") }, spawner);

    const { args } = calls[0];
    expect(args.slice(args.indexOf("-scale-to"), args.indexOf("-scale-to") + 2)).toEqual(["-scale-to", "1024"]);
    expect(args).not.toContain("-r");
  });

  it("restricts ffprobe and ffmpeg to local files and detaches ffmpeg from stdin", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nas-cloud-args-"));
    createdDirs.push(dir);
    const { spawner, calls } = recordingSpawner();

    await generateVideoPoster({ absolutePath: "/in/clip.mp4", outputJpegPath: path.join(dir, "poster.jpg") }, spawner);

    const probe = calls.find((call) => call.command === "ffprobe")?.args ?? [];
    const frame = calls.find((call) => call.command === "ffmpeg")?.args ?? [];
    for (const args of [probe, frame]) {
      const whitelist = args.indexOf("-protocol_whitelist");
      expect(args[whitelist + 1]).toBe("file");
      expect(whitelist).toBeGreaterThanOrEqual(0);
      expect(whitelist).toBeLessThan(args.indexOf("/in/clip.mp4"));
    }
    expect(frame).toContain("-nostdin");
    expect(probe).not.toContain("-nostdin");
  });
});
