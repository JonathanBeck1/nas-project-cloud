import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { SystemCategoryError, createMetadataRepository } from "@/lib/server/metadata";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb");

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(48).optional(),
    color: hexColor.optional()
  })
  .strict()
  .refine((data) => data.name !== undefined || data.color !== undefined, "no changes provided");

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
    return NextResponse.json({ error: "invalid category update" }, { status: 400 });
  }

  const parsed = updateCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid category update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());

  try {
    const updated = repo.updateCategory(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
    return NextResponse.json({ category: updated });
  } catch (error) {
    if (error instanceof SystemCategoryError) {
      return NextResponse.json({ error: "system categories cannot be modified" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const repo = createMetadataRepository(getDatabase());

  try {
    const removed = repo.deleteCategory(id);
    if (!removed) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SystemCategoryError) {
      return NextResponse.json({ error: "system categories cannot be deleted" }, { status: 409 });
    }
    throw error;
  }
}
