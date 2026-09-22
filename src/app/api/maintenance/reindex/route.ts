import { NextResponse } from "next/server";
import { requireMaintenanceAuth } from "@/lib/server/auth/maintenance";
import { appConfig } from "@/lib/server/config";
import { getDatabase } from "@/lib/server/db";
import { reindexStorageRoot } from "@/lib/server/reindex";

/**
 * Rebuild the file index from what is actually on disk.
 *
 * The `npm run index:storage` script cannot run inside the published image --
 * the Dockerfile ships neither `scripts/` nor `src/`, and `npm prune --omit=dev`
 * removes `tsx` -- so a deployed instance needs a recovery path that exists in
 * the image. This is it.
 *
 * Single-flight: a second caller joins the run in progress rather than starting
 * a competing scan over the same tree.
 */
export async function POST(request: Request) {
  const auth = await requireMaintenanceAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await reindexStorageRoot({
    db: getDatabase(),
    storageRoot: appConfig.storageRoot
  });

  return NextResponse.json(result);
}
