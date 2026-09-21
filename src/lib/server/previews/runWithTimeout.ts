import type { spawn, SpawnOptions } from "node:child_process";
import os from "node:os";

export type Spawner = typeof spawn;

type RunResult = { stdout: string; stderr: string };

export function runWithTimeout(
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
