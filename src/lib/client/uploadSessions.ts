import { csrfHeaders } from "@/lib/client/csrf";
import type { CloudFile, UploadSession } from "@/lib/shared/types";

export type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
};

type ResumeUploadSessionInput = {
  sessionId: string;
  file: File;
  receivedBytes: number;
  sizeBytes: number;
  chunkSizeBytes: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

type UploadFileInChunksInput = {
  file: File;
  sourceDevice: string;
  relativePath?: string | null;
  projectId?: string | null;
  projectSlug?: string | null;
  categoryId?: string | null;
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
  relativePath = null,
  projectId = null,
  projectSlug = null,
  categoryId = null,
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
      ...relativePathPayload(file, relativePath),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sourceDevice,
      ...targetPayload({ projectId, projectSlug, categoryId })
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

  await sendChunks({ sessionId, file, startOffset: 0, sizeBytes: file.size, chunkSizeBytes, fetchImpl, signal, onProgress });

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

const CHUNK_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;

type SendChunksInput = {
  sessionId: string;
  file: File;
  startOffset: number;
  sizeBytes: number;
  chunkSizeBytes: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

async function sendChunks({
  sessionId,
  file,
  startOffset,
  sizeBytes,
  chunkSizeBytes,
  fetchImpl,
  signal,
  onProgress
}: SendChunksInput): Promise<void> {
  let offset = startOffset;
  let failures = 0;

  while (offset < sizeBytes) {
    const end = Math.min(offset + chunkSizeBytes, sizeBytes);
    let response: Response | null = null;
    let networkError: unknown = null;
    try {
      response = await fetchImpl(`/api/upload-sessions/${encodeURIComponent(sessionId)}/chunk`, {
        method: "POST",
        headers: { "upload-offset": String(offset), ...csrfHeaders() },
        body: file.slice(offset, end),
        signal
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      networkError = error;
    }

    if (response?.ok) {
      const chunkBody = (await response.json()) as UploadSessionResponse;
      onProgress?.({ loadedBytes: chunkBody.session?.receivedBytes ?? end, totalBytes: sizeBytes });
      offset = end;
      failures = 0;
      continue;
    }

    const errorBody = response ? await errorBodyFrom(response) : {};
    // A 409 carries the server's offset: a chunk whose response was lost has already landed.
    const serverOffset =
      response?.status === 409 && typeof errorBody.receivedBytes === "number" ? errorBody.receivedBytes : null;
    const retryable = !response || response.status >= 500 || serverOffset !== null;
    failures += 1;
    if (!retryable || failures >= CHUNK_ATTEMPTS) {
      if (networkError) {
        throw networkError;
      }
      throw new Error(typeof errorBody.error === "string" && errorBody.error ? errorBody.error : "Upload failed");
    }

    if (serverOffset !== null) {
      offset = serverOffset;
    } else {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** (failures - 1)));
    }
  }
}

async function errorBodyFrom(response: Response): Promise<{ error?: unknown; receivedBytes?: unknown }> {
  try {
    return (await response.json()) as { error?: unknown; receivedBytes?: unknown };
  } catch {
    return {};
  }
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

export async function resumeUploadSession({
  sessionId,
  file,
  receivedBytes,
  sizeBytes,
  chunkSizeBytes,
  fetchImpl = fetch,
  signal,
  onProgress
}: ResumeUploadSessionInput): Promise<CloudFile> {
  await sendChunks({ sessionId, file, startOffset: receivedBytes, sizeBytes, chunkSizeBytes, fetchImpl, signal, onProgress });

  const completeResponse = await fetchImpl(`/api/upload-sessions/${encodeURIComponent(sessionId)}/complete`, {
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

function relativePathPayload(file: File, override?: string | null): { relativePath?: string } {
  if (override?.trim()) {
    return { relativePath: override.trim() };
  }

  const withRelativePath = file as File & { webkitRelativePath?: string };
  const relativePath =
    typeof withRelativePath.webkitRelativePath === "string" ? withRelativePath.webkitRelativePath.trim() : "";
  return relativePath ? { relativePath } : {};
}

function targetPayload(input: {
  projectId?: string | null;
  projectSlug?: string | null;
  categoryId?: string | null;
}): { projectId?: string; projectSlug?: string; categoryId?: string } {
  const payload: { projectId?: string; projectSlug?: string; categoryId?: string } = {};
  if (input.projectId && input.projectSlug) {
    payload.projectId = input.projectId;
    payload.projectSlug = input.projectSlug;
  }
  if (input.categoryId) {
    payload.categoryId = input.categoryId;
  }
  return payload;
}
