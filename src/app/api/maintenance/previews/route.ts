import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { runPreviewWorker } from "@/lib/server/previews/worker";

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await jsonBody(request);
  const limit = previewLimit(body?.limit);
  const result = await runPreviewWorker({ limit });
  return NextResponse.json({ result });
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function previewLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 25;
  }

  return Math.min(Math.max(value, 1), 100);
}
