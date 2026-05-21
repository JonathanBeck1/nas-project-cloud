/**
 * Next.js instrumentation hook. Loaded by both the Node and Edge
 * runtimes, so it must stay tiny and only delegate to a runtime-
 * specific module via dynamic import. This isolates the heavy
 * dependency graph (better-sqlite3, sharp, ffmpeg) from the Edge
 * bundle that would otherwise try to trace through it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
