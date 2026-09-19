import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session.ok) {
    return session.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({
    missingCount: repo.countMissingFiles(),
    missingFiles: repo.listMissingFiles().map(({ id, name, storagePath }) => ({ id, name, storagePath }))
  });
}
