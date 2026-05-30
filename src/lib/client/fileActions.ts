import { csrfHeaders } from "@/lib/client/csrf";
import type { CloudFile, FileShareLink } from "@/lib/shared/types";

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

export async function createFileShareLink(fileId: string): Promise<{ share: FileShareLink; url: string }> {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ expiresInHours: 24 })
  });

  let payload: { share?: FileShareLink; url?: string; error?: string };
  try {
    payload = (await response.json()) as { share?: FileShareLink; url?: string; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.share || !payload.url) {
    throw new Error(payload.error ?? "Could not create share link");
  }

  return { share: payload.share, url: payload.url };
}

export async function listFileShareLinks(fileId: string): Promise<FileShareLink[]> {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/shares`);

  let payload: { shares?: FileShareLink[]; error?: string };
  try {
    payload = (await response.json()) as { shares?: FileShareLink[]; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.shares) {
    throw new Error(payload.error ?? "Could not load share links");
  }

  return payload.shares;
}

export async function revokeFileShareLink(fileId: string, shareId: string): Promise<FileShareLink> {
  const response = await fetch(
    `/api/files/${encodeURIComponent(fileId)}/shares/${encodeURIComponent(shareId)}`,
    {
      method: "DELETE",
      headers: { ...csrfHeaders() }
    }
  );

  let payload: { share?: FileShareLink; error?: string };
  try {
    payload = (await response.json()) as { share?: FileShareLink; error?: string };
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.share) {
    throw new Error(payload.error ?? "Could not revoke share link");
  }

  return payload.share;
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
