import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(request: Request = new Request("http://localhost/api/categories")) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ categories: repo.listCategories() });
}
