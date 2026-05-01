import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const session = repo.getUploadSession(id);
  if (!session) {
    return NextResponse.json({ error: "upload session not found" }, { status: 404 });
  }
  if (session.status !== "open") {
    return NextResponse.json({ error: "upload session is not open" }, { status: 409 });
  }

  const storage = createStorageService();
  await storage.abortUploadSession(session.tempPath);
  const aborted = repo.abortUploadSession(id);

  return NextResponse.json({ session: aborted });
}
