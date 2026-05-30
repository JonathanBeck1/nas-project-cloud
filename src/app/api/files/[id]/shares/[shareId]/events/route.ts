import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id, shareId } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const shareBelongsToFile = repo.listFileShareLinks(file.id).some((share) => share.id === shareId);
  if (!shareBelongsToFile) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  return NextResponse.json({ events: repo.listFileShareAccessEvents(shareId) });
}
