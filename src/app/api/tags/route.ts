import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository, slugify } from "@/lib/server/metadata";

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(48)
});

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ tags: repo.listTags() });
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
    return NextResponse.json({ error: "invalid tag" }, { status: 400 });
  }

  const parsed = createTagSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid tag" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());
  const slug = slugify(parsed.data.name);
  const existing = repo.getTagBySlug(slug);
  if (existing) {
    return NextResponse.json({ error: "tag already exists", tag: existing }, { status: 409 });
  }

  const tag = repo.createTag({ name: parsed.data.name });
  return NextResponse.json({ tag }, { status: 201 });
}
