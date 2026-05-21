import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const projectStatusSchema = z.enum(["active", "paused", "complete", "archived"]);

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    status: projectStatusSchema.optional(),
    categoryId: z.string().trim().min(1).nullable().optional()
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.categoryId !== undefined,
    "no changes provided"
  );

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid project update" }, { status: 400 });
  }

  const parsed = updateProjectSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid project update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());

  if (parsed.data.categoryId !== undefined && parsed.data.categoryId !== null) {
    const category = repo.getCategoryById(parsed.data.categoryId);
    if (!category) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
  }

  const updated = repo.updateProject(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());

  const result = repo.deleteProject(id);
  if (!result.removed) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, detachedFiles: result.detachedFiles });
}
