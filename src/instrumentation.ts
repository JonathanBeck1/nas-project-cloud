/**
 * Next.js instrumentation hook. Runs once per Node.js worker boot, before
 * any request is handled. Used to start the in-process preview scheduler
 * when NAS_CLOUD_PREVIEW_SCHEDULER=on. Edge runtime is intentionally a
 * no-op — `better-sqlite3` and `sharp` only run in Node.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getAppConfig } = await import("@/lib/server/config");
  if (getAppConfig().previewScheduler !== "on") {
    return;
  }

  const { startPreviewScheduler } = await import("@/lib/server/previews/scheduler");
  startPreviewScheduler();
  console.log("[instrumentation] preview scheduler started");
}
