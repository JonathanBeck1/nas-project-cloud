import { csrfHeaders } from "@/lib/client/csrf";
import type { CloudFile } from "@/lib/shared/types";

export type FileAssignmentInput = {
  projectId?: string | null;
  categoryId?: string | null;
};

export async function archiveFile(fileId: string): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}/archive`, {
      method: "POST",
      headers: { ...csrfHeaders() }
    })
  );
}

export async function restoreFile(fileId: string): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, {
      method: "POST",
      headers: { ...csrfHeaders() }
    })
  );
}

export async function deleteFilePermanently(fileId: string): Promise<void> {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/delete`, {
    method: "DELETE",
    headers: { ...csrfHeaders() }
  });
  let payload: { ok?: boolean; error?: string };
  try {
    payload = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "File action failed");
  }
}

export async function updateFileAssignment(fileId: string, input: FileAssignmentInput): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(input)
    })
  );
}

export async function renameFile(fileId: string, name: string): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ name })
    })
  );
}

export async function setFileTags(fileId: string, tagIds: string[]): Promise<CloudFile> {
  return fileFromResponse(
    await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ tagIds })
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
