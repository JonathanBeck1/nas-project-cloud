import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { runWithTimeout, type Spawner } from "./runWithTimeout";

const RENDER_TIMEOUT_MS = 30_000;

export type PdfFirstPageInput = {
  absolutePath: string;
  outputPngPath: string;
};

/**
 * Render page 1 of a PDF to a PNG via `pdftoppm`, scaled so its long
 * edge is 1024 px whatever the page size. That leaves the downstream
 * `sharp` resize enough detail to keep at 384 px.
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

  // pdftoppm -f 1 -l 1 -singlefile -scale-to 1024 -png INPUT.pdf OUTPREFIX
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
    "-scale-to",
    "1024",
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
