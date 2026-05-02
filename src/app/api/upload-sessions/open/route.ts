import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  const sessions = repo.listOpenUploadSessions({
    userId: auth.userId,
    deviceId: auth.deviceId
  });

  return NextResponse.json({ sessions });
}
