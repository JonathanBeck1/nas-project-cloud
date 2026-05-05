import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (auth.deviceId === id) {
    return NextResponse.json({ error: "cannot revoke current device" }, { status: 409 });
  }

  const repo = createMetadataRepository(getDatabase());
  const revoked = repo.revokeDevice(auth.userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
