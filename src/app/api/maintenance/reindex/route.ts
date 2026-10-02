import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { requireMaintenanceAuth } from "@/lib/server/auth/maintenance";
import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { reindexStorageRoot } from "@/lib/server/reindex";

// A request stops hashing new files after this; the next run, or the background scheduler, picks up the rest.
const SYNC_BUDGET_MS = 20_000;
// Hashing one large file can outlast the budget, and a background run can be mid-import; don't hold the caller.
const MAX_WAIT_MS = SYNC_BUDGET_MS + 5_000;

/**
 * Storage sync: bring the index in line with what is on disk. New files are
 * indexed, files moved or renamed over SMB are relinked, and files that are gone
 * are marked missing. The published image ships no scripts, so this route is the
 * recovery path on a deployed instance as well as the cron entry point.
 */
export async function POST(request: Request) {
  const auth = await requireMaintenanceAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = reindexStorageRoot({ db: getDatabase(), storageRoot: appConfig.storageRoot, budgetMs: SYNC_BUDGET_MS });
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(resolve, MAX_WAIT_MS, null);
    });
    const result = await Promise.race([run, timeout]);
    return result ? NextResponse.json(result) : NextResponse.json({ running: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "storage sync failed" }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session.ok) {
    return session.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({
    missingCount: repo.countMissingFiles(),
    missingFiles: repo.listMissingFiles().map(({ id, name, storagePath }) => ({ id, name, storagePath }))
  });
}
