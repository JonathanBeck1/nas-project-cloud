import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { listSmartViewFiles } from "@/lib/server/smartViews";
import { SMART_VIEWS } from "@/lib/shared/defaults";

export async function GET(request: Request, { params }: { params: Promise<{ view: string }> }) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { view } = await params;
  const smartView = SMART_VIEWS.find((item) => item.key === view);

  if (!smartView) {
    return NextResponse.json({ error: "Unknown smart view" }, { status: 404 });
  }

  return NextResponse.json({ files: listSmartViewFiles(getDatabase(), smartView.key) });
}
