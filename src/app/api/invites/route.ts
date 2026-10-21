import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/server/audit";
import { adminOnly, canGrantRole } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { createSessionToken, hashSessionToken } from "@/lib/server/auth/sessions";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const createInviteSchema = z.object({ role: z.enum(["owner", "admin", "member"]) }).strict();

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  return NextResponse.json({ invites: createMetadataRepository(getDatabase()).listPendingInvites() });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid invite" }, { status: 400 });
  }
  if (!canGrantRole(auth, parsed.data.role)) {
    return NextResponse.json({ error: "you can't invite that role" }, { status: 403 });
  }

  // Only the hash is stored, so the link is shown this once.
  const token = createSessionToken();
  const invite = createMetadataRepository(getDatabase()).createInvite({
    tokenHash: hashSessionToken(token),
    role: parsed.data.role,
    createdBy: auth.userId,
    expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS).toISOString()
  });

  recordAudit(request, {
    userId: auth.userId,
    action: "invite_created",
    target: { type: "invite", id: invite.id },
    detail: { role: invite.role, expiresAt: invite.expiresAt }
  });
  return NextResponse.json({ invite, path: `/invite/${token}` }, { status: 201 });
}
