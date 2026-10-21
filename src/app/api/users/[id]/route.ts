import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/server/audit";
import { adminOnly, canGrantRole, canManageUser, currentActor } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const updateUserSchema = z
  .object({
    role: z.enum(["owner", "admin", "member"]).optional(),
    disabled: z.boolean().optional()
  })
  .strict()
  .refine((data) => data.role !== undefined || data.disabled !== undefined);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid user update" }, { status: 400 });
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const target = repo.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const actor = currentActor(repo, auth);
  if (!actor || !canManageUser(actor, target) || (parsed.data.role && !canGrantRole(actor, parsed.data.role))) {
    return NextResponse.json({ error: "you can't change this account" }, { status: 403 });
  }

  const subject = { type: "user" as const, id, label: target.email };
  if (parsed.data.role && parsed.data.role !== target.role) {
    repo.updateUserRole(id, parsed.data.role);
    recordAudit(request, {
      userId: auth.userId,
      action: "user_role_changed",
      target: subject,
      detail: { from: target.role, to: parsed.data.role }
    });
  }
  if (parsed.data.disabled !== undefined) {
    repo.setUserDisabled(id, parsed.data.disabled);
    recordAudit(request, { userId: auth.userId, action: parsed.data.disabled ? "user_disabled" : "user_enabled", target: subject });
  }

  return NextResponse.json({ user: repo.listTeamMembers().find((user) => user.id === id) });
}

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
  const target = repo.getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const actor = currentActor(repo, auth);
  if (!actor || !canManageUser(actor, target)) {
    return NextResponse.json({ error: "you can't change this account" }, { status: 403 });
  }

  repo.deleteUser(id);
  recordAudit(request, { userId: auth.userId, action: "user_removed", target: { type: "user", id, label: target.email } });
  return NextResponse.json({ ok: true });
}
