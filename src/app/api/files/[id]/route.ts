import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = createMetadataRepository(getDatabase()).getFileById(id);

  if (!file) {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  return NextResponse.json({ file });
}
