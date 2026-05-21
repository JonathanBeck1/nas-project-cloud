import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { probeFfmpeg } from "@/lib/server/previews/ffmpeg";
import { probePoppler } from "@/lib/server/previews/poppler";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (!session.ok) {
    return session.response;
  }

  const repo = createMetadataRepository(getDatabase());
  const counts = repo.countFilePreviewsByStatus();
  const lastReadyAt = repo.lastSuccessfulPreviewAt();
  const [ffmpeg, poppler] = await Promise.all([probeFfmpeg(), probePoppler()]);

  return NextResponse.json({
    counts,
    lastReadyAt,
    ffmpeg: { available: ffmpeg.available, version: ffmpeg.version ?? null },
    poppler: { available: poppler.available, version: poppler.version ?? null }
  });
}
