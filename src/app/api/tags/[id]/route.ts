import { NextResponse } from "next/server";
import { adminOnly } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const removed = repo.deleteTag(id);

  if (!removed) {
    return NextResponse.json({ error: "tag not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
