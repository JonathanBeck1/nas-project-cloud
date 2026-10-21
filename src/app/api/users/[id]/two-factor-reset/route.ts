import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/server/audit";
import { adminOnly, canManageUser, currentActor } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

// For someone who lost their phone and recovery codes: signs them out, and their next sign-in sets two-factor up again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const target = repo.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const actor = currentActor(repo, auth);
  if (!actor || !canManageUser(actor, target)) {
    return NextResponse.json({ error: "you can't change this account" }, { status: 403 });
  }

  repo.resetTwoFactor(id);
  recordAudit(request, { userId: auth.userId, action: "two_factor_reset", target: { type: "user", id, label: target.email } });
  return NextResponse.json({ ok: true });
}
