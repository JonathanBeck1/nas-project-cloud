import { previewKindForFile } from "@/lib/shared/fileTypes";
import type { CloudFile, FilePreview } from "@/lib/shared/types";

type PreviewQueueRepository = {
  upsertFilePreview: (input: {
    fileId: string;
    kind: FilePreview["kind"];
    status: FilePreview["status"];
  }) => FilePreview | unknown;
};

export function enqueuePreviewForFile(repo: PreviewQueueRepository, file: CloudFile): void {
  const kind = previewKindForFile(file);
  if (!kind) {
    return;
  }

  repo.upsertFilePreview({
    fileId: file.id,
    kind,
    status: "pending"
  });
}
