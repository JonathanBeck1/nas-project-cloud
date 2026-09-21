import type { AppDatabase } from "@/lib/server/db";
import { filesFromRowsWithTags, type FileRow } from "@/lib/server/metadata";
import type { CloudFile, SmartViewKey } from "@/lib/shared/types";

export const LARGE_FILE_BYTES = 1_073_741_824;
export const SMART_VIEW_LIMIT = 200;

export function listSmartViewFiles(db: AppDatabase, view: SmartViewKey): { files: CloudFile[]; truncated: boolean } {
  const params: Record<string, string | number> = {};
  const clauses: Record<SmartViewKey, string> = {
    inbox: "project_id is null",
    recent: "1 = 1",
    unsorted: "project_id is null",
    "large-files": "size_bytes >= @largeFileBytes",
    cad: "family = 'cad'",
    media: "family in ('image', 'video')",
    images: "family = 'image'",
    videos: "family = 'video'",
    "from-windows": "lower(source_device) like '%windows%'",
    "from-mac": "(lower(source_device) like '%mac%' or lower(source_device) like '%macbook%')"
  };

  if (view === "large-files") {
    params.largeFileBytes = LARGE_FILE_BYTES;
  }

  const rows = db
    .prepare<Record<string, string | number>, FileRow>(
      `select * from files where status = 'active' and (${clauses[view]}) order by uploaded_at desc, name, id limit ${SMART_VIEW_LIMIT + 1}`
    )
    .all(params);

  return { files: filesFromRowsWithTags(db, rows.slice(0, SMART_VIEW_LIMIT)), truncated: rows.length > SMART_VIEW_LIMIT };
}
