import type { CloudFile } from "@/lib/shared/types";

export type FileAssignmentInput = {
  projectId?: string | null;
  categoryId?: string | null;
};

export async function archiveFile(fileId: string): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}/archive`, {
      method: "POST"
    })
  );
}

export async function updateFileAssignment(fileId: string, input: FileAssignmentInput): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export function downloadUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}/download`;
}

async function fileFromResponse(response: Response): Promise<CloudFile> {
  let payload: { file?: CloudFile; error?: string };
  try {
    payload = (await response.json()) as { file?: CloudFile; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.file) {
    throw new Error(payload.error ?? "File action failed");
  }

  return payload.file;
}
