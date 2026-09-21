import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { hashSharePassword } from "@/lib/server/auth/passwords";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { shareExpiresAt } from "@/lib/server/shareLinks";

const updateShareSchema = z
  .object({
    expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
    maxDownloads: z.number().int().min(1).max(10_000).nullable().optional(),
    label: z.string().max(120).nullable().optional(),
    password: z.string().min(8).max(200).nullable().optional()
  })
  .strict();

export async function DELETE(
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

  // SECURITY: not scoped to created_by_user_id. Harmless with a single owner; an IDOR if multi-user lands.
  const share = repo.revokeFileShareLink(file.id, shareId);
  return share
    ? NextResponse.json({ share })
    : NextResponse.json({ error: "share not found" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid share link" }, { status: 400 });
  }

  const parsed = updateShareSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid share link" }, { status: 400 });
  }

  const { id, shareId } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const input = parsed.data;
  // SECURITY: not scoped to created_by_user_id. Harmless with a single owner; an IDOR if multi-user lands.
  const share = repo.updateFileShareLink(file.id, shareId, {
    ...(input.expiresInHours !== undefined ? { expiresAt: shareExpiresAt(input.expiresInHours) } : {}),
    ...(input.maxDownloads !== undefined ? { maxDownloads: input.maxDownloads } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.password !== undefined
      ? { passwordHash: input.password === null ? null : await hashSharePassword(input.password) }
      : {})
  });

  return share
    ? NextResponse.json({ share })
    : NextResponse.json({ error: "share not found" }, { status: 404 });
}
