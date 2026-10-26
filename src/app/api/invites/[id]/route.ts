import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { adminOnly, canGrantRole } from "@/lib/server/auth/access";
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
  const invite = repo.getPendingInvite({ id });
  if (!invite) {
    return NextResponse.json({ error: "invite not found" }, { status: 404 });
  }
  if (!canGrantRole(auth, invite.role)) {
    return NextResponse.json({ error: "you can't revoke that invite" }, { status: 403 });
  }

  repo.deleteInvite(id);
  recordAudit(request, { userId: auth.userId, action: "invite_revoked", target: { type: "invite", id }, detail: { role: invite.role } });
  return NextResponse.json({ ok: true });
}
