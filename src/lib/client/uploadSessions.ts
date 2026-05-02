import type { CloudFile } from "@/lib/shared/types";

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
  onProgress
}: UploadFileInChunksInput): Promise<CloudFile> {
  const sessionResponse = await fetchImpl("/api/upload-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  for (let offset = 0; offset < file.size; offset += chunkSizeBytes) {
    const end = Math.min(offset + chunkSizeBytes, file.size);
    const chunkResponse = await fetchImpl(`/api/upload-sessions/${sessionId}/chunk`, {
      method: "POST",
      headers: { "upload-offset": String(offset) },
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

async function uploadErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error.length > 0 ? body.error : "Upload failed";
  } catch {
    return "Upload failed";
  }
}
