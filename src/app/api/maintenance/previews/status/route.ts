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
  const counts = repo.countFilePreviewsByStatus();
  const lastReadyAt = repo.lastSuccessfulPreviewAt();

  return NextResponse.json({
    counts,
    lastReadyAt
  });
}
