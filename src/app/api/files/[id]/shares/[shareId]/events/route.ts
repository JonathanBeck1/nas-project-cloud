import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> }
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id, shareId } = await params;
  const repo = createMetadataRepository(getDatabase());
  const file = repo.getFileById(id);
  if (!file || file.status !== "active") {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }

  const shareBelongsToFile = repo.listFileShareLinks(file.id).some((share) => share.id === shareId);
  if (!shareBelongsToFile) {
    return NextResponse.json({ error: "share not found" }, { status: 404 });
  }

  // SECURITY: not scoped to created_by_user_id. Harmless with a single owner; an IDOR if multi-user lands.
  const events = repo.listFileShareAccessEvents(shareId);
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv") {
    return new Response(accessEventsCsv(events), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${csvFilename(shareId)}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  }

  return NextResponse.json({ events });
}

type ShareAccessEventCsvRow = {
  accessedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

function accessEventsCsv(events: ShareAccessEventCsvRow[]): string {
  const rows = events.map((event) =>
    [event.accessedAt, event.ipAddress ?? "", event.userAgent ?? ""].map(csvCell).join(",")
  );
  return ["accessed_at,ip_address,user_agent", ...rows].join("\n") + "\n";
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function csvFilename(shareId: string): string {
  return `share-${shareId.replaceAll(/[^A-Za-z0-9_-]/g, "_")}-access-events.csv`;
}
