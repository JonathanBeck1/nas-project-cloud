import { NextResponse } from "next/server";
import { AUDIT_PAGE_SIZE, parseAuditFilters } from "@/lib/server/audit";
import { adminOnly } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const denied = adminOnly(auth);
  if (denied) {
    return denied;
  }

  const filters = parseAuditFilters(new URL(request.url).searchParams);
  if (!filters) {
    return NextResponse.json({ error: "invalid audit filter" }, { status: 400 });
  }

  return NextResponse.json(createMetadataRepository(getDatabase()).listAuditEvents({ ...filters, limit: AUDIT_PAGE_SIZE }));
}
