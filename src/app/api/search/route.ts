import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository, SEARCH_FILES_LIMIT } from "@/lib/server/metadata";
import type { FileFamily } from "@/lib/shared/types";

const FAMILIES = ["cad", "image", "video", "document", "archive", "software", "other"] as const satisfies readonly FileFamily[];

const searchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  projectId: z.string().trim().min(1).max(64).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  tagId: z.string().trim().min(1).max(64).optional(),
  family: z.enum(FAMILIES).optional(),
  minBytes: z.coerce.number().int().nonnegative().optional(),
  maxBytes: z.coerce.number().int().nonnegative().optional(),
  from: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "invalid from date" })
    .optional(),
  to: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "invalid to date" })
    .optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true")
});

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    raw[key] = value;
  }

  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid search filters" }, { status: 400 });
  }

  const data = parsed.data;
  const repo = createMetadataRepository(getDatabase());
  const result = repo.searchFiles({
    query: data.q,
    projectId: data.projectId,
    categoryId: data.categoryId,
    tagId: data.tagId,
    family: data.family,
    minBytes: data.minBytes,
    maxBytes: data.maxBytes,
    from: data.from ? new Date(data.from).toISOString() : undefined,
    to: data.to ? new Date(data.to).toISOString() : undefined,
    includeArchived: data.includeArchived
  });

  return NextResponse.json({
    files: result.files,
    truncated: result.truncated,
    limit: SEARCH_FILES_LIMIT
  });
}
