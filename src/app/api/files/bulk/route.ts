import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const bulkFileSchema = z
  .object({
    fileIds: z.array(z.string().min(1)).min(1).max(500),
    projectId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional()
  })
  .strict()
  .refine((data) => data.projectId !== undefined || data.categoryId !== undefined);

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid bulk file update" }, { status: 400 });
  }

  const parsed = bulkFileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid bulk file update" }, { status: 400 });
  }

  const repo = createMetadataRepository(getDatabase());

  if (parsed.data.projectId) {
    const project = repo.getProjectById(parsed.data.projectId);
    if (!project) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }
  }

  if (parsed.data.categoryId) {
    const categoryExists = repo.listCategories().some((category) => category.id === parsed.data.categoryId);
    if (!categoryExists) {
      return NextResponse.json({ error: "category not found" }, { status: 404 });
    }
  }

  const files = repo.bulkUpdateFiles(parsed.data);
  return NextResponse.json({ files });
}
