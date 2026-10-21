import { NextResponse } from "next/server";
import { AUDIT_CSV_HEADER, auditCsvRow, parseAuditFilters, recordAudit } from "@/lib/server/audit";
import { adminOnly } from "@/lib/server/auth/access";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

const EXPORT_BATCH = 1000;

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
  const scope = { userId: filters.userId, action: filters.action, from: filters.from, to: filters.to };
  recordAudit(request, { userId: auth.userId, action: "audit_exported", detail: scope });

  // Read in batches between chunks: an open SQLite iterator would block every other query until the download ends.
  const repo = createMetadataRepository(getDatabase());
  const encoder = new TextEncoder();
  let cursor: string | null = null;
  let started = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const page = repo.listAuditEvents({ ...scope, cursor, limit: EXPORT_BATCH });
      const lines = page.events.map(auditCsvRow);
      if (!started) {
        lines.unshift(AUDIT_CSV_HEADER);
        started = true;
      }
      if (lines.length > 0) {
        controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
      }
      cursor = page.nextCursor;
      if (!cursor) {
        controller.close();
      }
    }
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${date}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
