import { getAppConfig } from "@/lib/server/config";
import { startPreviewScheduler } from "@/lib/server/previews/scheduler";
import { startReconcileScheduler } from "@/lib/server/reconcileScheduler";

if (getAppConfig().previewScheduler === "on") {
  startPreviewScheduler();
  console.log("[instrumentation] preview scheduler started");
}

if (getAppConfig().reconcileScheduler === "on") {
  startReconcileScheduler();
  console.log("[instrumentation] storage reconcile scheduler started");
}
