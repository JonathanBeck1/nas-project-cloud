import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

// Anything younger may belong to a file created after the id list was read, or to a job still writing.
const MIN_AGE_MS = 60 * 60 * 1000;
const PREVIEW_NAME = /^(.+)\.webp$/;
const STAGED_PREVIEW_NAME = /\.webp\.[A-Za-z0-9_-]+\.tmp$/;
const WORKER_TEMP_NAME = /^nas-cloud-(poster|pdf)-/;

type SweepInput = {
  storage?: Pick<ReturnType<typeof createStorageService>, "containedPath">;
  repo?: Pick<ReturnType<typeof createMetadataRepository>, "listFileIds">;
  tmpDir?: string;
  now?: Date;
};

// Thumbnails are copies of file content, so one left behind by a delete stays readable over SMB and in snapshots.
export async function sweepOrphanPreviews(input: SweepInput = {}): Promise<{ removed: number }> {
  const storage = input.storage ?? createStorageService();
  const repo = input.repo ?? createMetadataRepository(getDatabase());
  const cutoff = (input.now ?? new Date()).getTime() - MIN_AGE_MS;

  // containedPath refuses a .previews or images folder that has been swapped for a symlink out of the root.
  const previewDirectory = path.dirname(await storage.containedPath(path.posix.join(".previews", "images", "_")));
  const fileIds = repo.listFileIds();
  let removed = await removeOld(previewDirectory, cutoff, (name) => {
    const preview = PREVIEW_NAME.exec(name);
    return preview ? !fileIds.has(preview[1]) : STAGED_PREVIEW_NAME.test(name);
  });
  removed += await removeOld(input.tmpDir ?? os.tmpdir(), cutoff, (name) => WORKER_TEMP_NAME.test(name));
  return { removed };
}

async function removeOld(directory: string, cutoff: number, shouldRemove: (name: string) => boolean): Promise<number> {
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  let removed = 0;
  for (const name of names.filter(shouldRemove)) {
    const absolutePath = path.join(directory, name);
    const stats = await fs.lstat(absolutePath).catch(() => null);
    if (!stats || stats.isDirectory() || stats.mtimeMs > cutoff) {
      continue;
    }
    await fs.unlink(absolutePath).then(
      () => removed++,
      () => undefined
    );
  }
  return removed;
}
