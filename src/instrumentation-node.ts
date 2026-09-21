import { getAppConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { startPreviewScheduler } from "@/lib/server/previews/scheduler";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

const repo = createMetadataRepository(getDatabase());
repo.purgeExpiredAuthState();
const stale = repo.requeueStalePreviewJobs();
if (stale.requeued > 0 || stale.failed > 0) {
  console.log(`[instrumentation] previews interrupted by the last shutdown: ${stale.requeued} requeued, ${stale.failed} failed`);
}

if (getAppConfig().previewScheduler === "on") {
  startPreviewScheduler({
    runHourlyMaintenance: async () => {
      await cleanupStaleUploads({ olderThan: new Date(Date.now() - STALE_UPLOAD_MS) });
      repo.purgeExpiredAuthState();
    }
  });
  console.log("[instrumentation] preview scheduler started");
}
