import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { hashPassword } from "@/lib/server/auth/passwords";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";
import { createShareToken, hashShareToken, shareExpiresAt } from "@/lib/server/shareLinks";

const createShareSchema = z
  .object({
    expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
    maxDownloads: z.number().int().min(1).max(10_000).nullable().optional(),
    label: z.string().max(120).nullable().optional(),
    password: z.string().min(8).max(200).nullable().optional()
  })
  .strict()
  .optional();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  let payload: unknown = undefined;
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid share link" }, { status: 400 });
    }
  }

  const parsed = createShareSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid share link" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const token = createShareToken();
  const share = repo.createFileShareLink({
    fileId: file.id,
    tokenHash: hashShareToken(token),
    createdByUserId: auth.userId,
    expiresAt: shareExpiresAt(parsed.data?.expiresInHours),
    maxDownloads: parsed.data?.maxDownloads ?? null,
    label: parsed.data?.label ?? null,
    passwordHash: parsed.data?.password ? await hashPassword(parsed.data.password) : null
  });

  return NextResponse.json(
    {
      share,
      url: `/shares/${encodeURIComponent(token)}`
    },
    { status: 201 }
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  return NextResponse.json({ shares: repo.listFileShareLinks(file.id) });
}
