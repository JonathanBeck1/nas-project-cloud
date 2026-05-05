import type { CloudFile, FilePreview, FilePreviewKind } from "@/lib/shared/types";

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

function previewKindForFile(file: CloudFile): FilePreviewKind | null {
  if (file.family === "image") {
    return "image";
  }
  if (file.family === "video") {
    return "video";
  }
  if (file.family === "document") {
    return "document";
  }
  return null;
}
