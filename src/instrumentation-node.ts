import { formatSetupCode } from "@/lib/server/auth/setupCode";
import { backupDatabase } from "@/lib/server/backup";
import { getAppConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { sweepOrphanPreviews } from "@/lib/server/previews/cleanup";
import { startPreviewScheduler } from "@/lib/server/previews/scheduler";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const repo = createMetadataRepository(getDatabase());
repo.purgeExpiredAuthState();
if (repo.countUsers() === 0) {
  console.log(`[setup] No owner yet. Enter this setup code on the setup page: ${formatSetupCode(repo.getOrCreateSetupCode())}`);
}
const stale = repo.requeueStalePreviewJobs();
if (stale.requeued > 0 || stale.failed > 0) {
  console.log(`[instrumentation] previews interrupted by the last shutdown: ${stale.requeued} requeued, ${stale.failed} failed`);
}

if (getAppConfig().previewScheduler === "on") {
  startPreviewScheduler({
    runHourlyMaintenance: async () => {
      await cleanupStaleUploads({ olderThan: new Date(Date.now() - STALE_UPLOAD_MS) });
      repo.purgeExpiredAuthState();
      await sweepOrphanPreviews();
      await backupDatabase({ db: getDatabase(), dbPath: getAppConfig().dbPath });
    }
  });
  console.log("[instrumentation] preview scheduler started");
}
