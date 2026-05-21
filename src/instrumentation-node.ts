import { getAppConfig } from "@/lib/server/config";
import { startPreviewScheduler } from "@/lib/server/previews/scheduler";

if (getAppConfig().previewScheduler === "on") {
  startPreviewScheduler();
  console.log("[instrumentation] preview scheduler started");
}
