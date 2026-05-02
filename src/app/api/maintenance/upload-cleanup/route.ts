import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { cleanupStaleUploads } from "@/lib/server/uploadCleanup";

const DEFAULT_STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const result = await cleanupStaleUploads({
    olderThan: new Date(Date.now() - DEFAULT_STALE_UPLOAD_MS)
  });

  return NextResponse.json(result);
}
