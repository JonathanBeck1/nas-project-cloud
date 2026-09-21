import { NextResponse } from "next/server";
import { requireMaintenanceAuth } from "@/lib/server/auth/maintenance";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

const DEFAULT_STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireMaintenanceAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await cleanupStaleUploads({
    olderThan: new Date(Date.now() - DEFAULT_STALE_UPLOAD_MS)
  });
  // With the in-process scheduler off, this cron call is the only periodic job there is.
  const purged = createMetadataRepository(getDatabase()).purgeExpiredAuthState();

  return NextResponse.json({ ...result, purged });
}
