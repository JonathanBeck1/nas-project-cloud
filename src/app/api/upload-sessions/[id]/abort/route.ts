import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createStorageService } from "@/lib/server/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  // Upload sessions are private to whoever opened them, admins included.
  const session = repo.getUploadSession(id);
  if (!session || session.userId !== auth.userId) {
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
