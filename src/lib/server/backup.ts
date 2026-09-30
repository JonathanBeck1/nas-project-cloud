import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppDatabase } from "@/lib/server/db";

const KEEP = 7;
const STALE_STAGED_MS = 60 * 60 * 1000;
const BACKUP_NAME = /^nas-cloud-\d{4}-\d{2}-\d{2}\.sqlite$/;
const STAGED_NAME = /^nas-cloud-\d{4}-\d{2}-\d{2}\.sqlite\.[a-z0-9]+\.tmp$/;

// Tags, shares, users and devices exist only in SQLite. db.backup() copies a consistent snapshot while the
// app keeps writing, which a file copy of a WAL database can't promise.
export async function backupDatabase(input: {
  db: AppDatabase;
  dbPath: string;
  now?: Date;
}): Promise<{ created: string | null; removed: number }> {
  const now = input.now ?? new Date();
  const directory = path.join(path.dirname(input.dbPath), "backups");
  await fs.mkdir(directory, { recursive: true });

  const target = path.join(directory, `nas-cloud-${now.toISOString().slice(0, 10)}.sqlite`);
  let created: string | null = null;
  if (!(await fs.stat(target).catch(() => null))) {
    // Unique, so a cron call and the in-process scheduler running at once can't write into the same file.
    const staged = `${target}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    try {
      await input.db.backup(staged);
      await fs.rename(staged, target);
    } catch (error) {
      await fs.rm(staged, { force: true });
      throw error;
    }
    created = target;
  }

  const names = await fs.readdir(directory);
  for (const name of names.filter((name) => STAGED_NAME.test(name))) {
    const staged = path.join(directory, name);
    const stats = await fs.stat(staged).catch(() => null);
    if (stats && stats.mtimeMs < now.getTime() - STALE_STAGED_MS) {
      await fs.rm(staged, { force: true });
    }
  }
  const expired = names.filter((name) => BACKUP_NAME.test(name)).sort().reverse().slice(KEEP);
  for (const name of expired) {
    await fs.rm(path.join(directory, name), { force: true });
  }
  return { created, removed: expired.length };
}
