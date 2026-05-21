import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository, slugify } from "@/lib/server/metadata";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb");

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: hexColor
});

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ categories: repo.listCategories() });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const parsed = createCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const slug = slugify(parsed.data.name);
  const existing = repo.getCategoryBySlug(slug);
  if (existing) {
    return NextResponse.json({ error: "category already exists", category: existing }, { status: 409 });
  }

  const category = repo.createCategory({ name: parsed.data.name, color: parsed.data.color });
  return NextResponse.json({ category }, { status: 201 });
}
