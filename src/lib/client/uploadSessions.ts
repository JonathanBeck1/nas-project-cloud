import { csrfHeaders } from "@/lib/client/csrf";
import type { CloudFile, UploadSession } from "@/lib/shared/types";

export type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
};

type UploadFileInChunksInput = {
  file: File;
  sourceDevice: string;
  chunkSizeBytes: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onSessionCreated?: (sessionId: string) => void;
  onProgress?: (progress: UploadProgress) => void;
};

type UploadSessionResponse = {
  session?: {
    id?: string;
    receivedBytes?: number;
  };
};

export async function uploadFileInChunks({
  file,
  sourceDevice,
  chunkSizeBytes,
  fetchImpl = fetch,
  signal,
  onSessionCreated,
  onProgress
}: UploadFileInChunksInput): Promise<CloudFile> {
  const sessionResponse = await fetchImpl("/api/upload-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({
      filename: file.name || "upload.bin",
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sourceDevice
    }),
    signal
  });

  if (!sessionResponse.ok) {
    throw new Error(await uploadErrorMessage(sessionResponse));
  }

  const sessionBody = (await sessionResponse.json()) as UploadSessionResponse;
  const sessionId = sessionBody.session?.id;
  if (!sessionId) {
    throw new Error("Upload failed");
  }
  onSessionCreated?.(sessionId);

  for (let offset = 0; offset < file.size; offset += chunkSizeBytes) {
    const end = Math.min(offset + chunkSizeBytes, file.size);
    const chunkResponse = await fetchImpl(`/api/upload-sessions/${sessionId}/chunk`, {
      method: "POST",
      headers: { "upload-offset": String(offset), ...csrfHeaders() },
      body: file.slice(offset, end),
      signal
    });

    if (!chunkResponse.ok) {
      throw new Error(await uploadErrorMessage(chunkResponse));
    }

    const chunkBody = (await chunkResponse.json()) as UploadSessionResponse;
    onProgress?.({
      loadedBytes: chunkBody.session?.receivedBytes ?? end,
      totalBytes: file.size
    });
  }

  const completeResponse = await fetchImpl(`/api/upload-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { ...csrfHeaders() },
    signal
  });

  if (!completeResponse.ok) {
    throw new Error(await uploadErrorMessage(completeResponse));
  }

  const completeBody = (await completeResponse.json()) as { file?: CloudFile };
  if (!completeBody.file) {
    throw new Error("Upload failed");
  }
  return completeBody.file;
}

export async function abortUploadSession(sessionId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl(`/api/upload-sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
    headers: { ...csrfHeaders() }
  });

  if (!response.ok) {
    throw new Error(await uploadErrorMessage(response));
  }
}

export type UploadSessionStatusFilter = "open" | "completed" | "failed" | "aborted" | "all";

export type ListUploadSessionsOptions = {
  status?: UploadSessionStatusFilter;
  deviceId?: string | null;
  fetchImpl?: typeof fetch;
};

export async function listUploadSessions({
  status = "open",
  deviceId = null,
  fetchImpl = fetch
}: ListUploadSessionsOptions = {}): Promise<UploadSession[]> {
  const params = new URLSearchParams({ status });
  if (deviceId) {
    params.set("deviceId", deviceId);
  }

  const response = await fetchImpl(`/api/upload-sessions?${params.toString()}`, {
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(await uploadErrorMessage(response));
  }

  const body = (await response.json()) as { sessions?: UploadSession[] };
  return body.sessions ?? [];
}

/** @deprecated Use listUploadSessions({ status: "open" }) instead. */
export async function listOpenUploadSessions(fetchImpl: typeof fetch = fetch): Promise<UploadSession[]> {
  return listUploadSessions({ status: "open", fetchImpl });
}

async function uploadErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error.length > 0 ? body.error : "Upload failed";
  } catch {
    return "Upload failed";
  }
}
