import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET() {
  const repo = createMetadataRepository(getDatabase());
  return NextResponse.json({ categories: repo.listCategories() });
}
