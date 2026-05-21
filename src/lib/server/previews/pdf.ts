import { spawn, type SpawnOptions } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RENDER_TIMEOUT_MS = 30_000;

export type PdfFirstPageInput = {
  absolutePath: string;
  outputPngPath: string;
};

type Spawner = typeof spawn;

/**
 * Render page 1 of a PDF to a PNG via `pdftoppm`. The output edge
 * cap is a comfortable 1024 px so the downstream `sharp` resize
 * still has detail to keep at 384 px.
 *
 * Encrypted PDFs cause `pdftoppm` to exit non-zero with a clear
 * error (e.g. "Command Line Error: Incorrect password"); we
 * preserve that string in the rejection so the worker can record
 * it as the `error` field on the failed preview row.
 */
export async function renderPdfFirstPage(
  input: PdfFirstPageInput,
  spawner: Spawner = spawn
): Promise<void> {
  await fs.mkdir(path.dirname(input.outputPngPath), { recursive: true });

  // pdftoppm -f 1 -l 1 -singlefile -r 150 -png INPUT.pdf OUTPREFIX
  // writes OUTPREFIX.png. We pass an output prefix without the
  // extension because pdftoppm appends it automatically when
  // -singlefile is in use.
  const outputPrefix = stripExtension(input.outputPngPath);

  const args = [
    "-f",
    "1",
    "-l",
    "1",
    "-singlefile",
    "-r",
    "150",
    "-png",
    input.absolutePath,
    outputPrefix
  ];

  await runWithTimeout("pdftoppm", args, RENDER_TIMEOUT_MS, spawner);
}

function stripExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
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
