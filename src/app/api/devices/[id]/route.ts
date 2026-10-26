import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
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
  const device = repo.listDevices(auth.userId).find((candidate) => candidate.id === id);
  const revoked = repo.revokeDevice(auth.userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  recordAudit(request, { userId: auth.userId, action: "device_removed", target: { type: "device", id, label: device?.name } });
  return NextResponse.json({ ok: true });
}
