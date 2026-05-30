"use client";

import React, { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { abortUploadSession, uploadFileInChunks } from "@/lib/client/uploadSessions";
import { csrfHeaders } from "@/lib/client/csrf";
import { resolveSourceDeviceLabel } from "@/lib/client/sourceDevice";
import type { CloudFile } from "@/lib/shared/types";

type DropZoneProps = {
  children: React.ReactNode;
  inputId?: string;
  folderInputId?: string;
  onUploaded?: (files: CloudFile[]) => void;
  chunkedUploadThresholdBytes?: number;
  chunkSizeBytes?: number;
};

type UploadStatus = {
  tone: "loading" | "success" | "error";
  message: string;
};

type ActiveUpload = {
  controller: AbortController;
  sessionId?: string;
};

const DEFAULT_CHUNKED_UPLOAD_THRESHOLD_BYTES = 64 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

export function DropZone({
  children,
  inputId,
  folderInputId,
  onUploaded,
  chunkedUploadThresholdBytes = DEFAULT_CHUNKED_UPLOAD_THRESHOLD_BYTES,
  chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES
}: DropZoneProps) {
  const [dragDepth, setDragDepth] = useState(0);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null);
  const [sourceDevice, setSourceDevice] = useState<string>("Browser");
  const cancelRequestedRef = useRef(false);
  const isDragging = dragDepth > 0;

  useEffect(() => {
    setSourceDevice(resolveSourceDeviceLabel());
  }, []);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    try {
      const uploadedFiles: CloudFile[] = [];
      cancelRequestedRef.current = false;

      for (const file of files) {
        setStatus({ tone: "loading", message: `Uploading ${file.name}` });
        const uploaded = file.size > chunkedUploadThresholdBytes ? await uploadChunked(file) : await uploadSingle(file);
        uploadedFiles.push(uploaded);
      }

      if (uploadedFiles.length > 0) {
        onUploaded?.(uploadedFiles);
      }

      setStatus({
        tone: "success",
        message: files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${files.length} files`
      });
    } catch (error) {
      setStatus({
        tone: cancelRequestedRef.current ? "success" : "error",
        message: cancelRequestedRef.current ? "Upload canceled" : error instanceof Error ? error.message : "Upload failed"
      });
    } finally {
      setActiveUpload(null);
    }
  }

  async function uploadSingle(file: File): Promise<CloudFile> {
    const relativePath = browserRelativePath(file);
    const params = new URLSearchParams({
      filename: file.name || "upload.bin",
      sourceDevice,
      mimeType: file.type || "application/octet-stream"
    });
    if (relativePath) {
      params.set("relativePath", relativePath);
    }

    const response = await fetch(`/api/files?${params.toString()}`, {
      method: "POST",
      headers: {
        ...csrfHeaders(),
        "content-type": file.type || "application/octet-stream"
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(await uploadErrorMessage(response));
    }

    const body = (await response.json()) as { file?: CloudFile };
    if (!body.file) {
      throw new Error("Upload failed");
    }
    return body.file;
  }

  async function uploadChunked(file: File): Promise<CloudFile> {
    const controller = new AbortController();
    setActiveUpload({ controller });

    return uploadFileInChunks({
      file,
      sourceDevice,
      chunkSizeBytes,
      signal: controller.signal,
      onSessionCreated: (sessionId) => setActiveUpload({ controller, sessionId }),
      onProgress: ({ loadedBytes, totalBytes }) =>
        setStatus({ tone: "loading", message: `Uploading ${file.name} ${loadedBytes}/${totalBytes}` })
    });
  }

  async function cancelUpload() {
    const upload = activeUpload;
    if (!upload) {
      return;
    }

    cancelRequestedRef.current = true;
    upload.controller.abort();

    if (upload.sessionId) {
      await abortUploadSession(upload.sessionId).catch(() => undefined);
    }

    setActiveUpload(null);
    setStatus({ tone: "success", message: "Upload canceled" });
  }

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        event.preventDefault();
        setDragDepth((depth) => depth + 1);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragDepth((depth) => Math.max(0, depth - 1));
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragDepth(0);
        void uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}

      <input
        id={inputId}
        aria-label="Choose files"
        className="sr-only"
        multiple
        type="file"
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          event.target.value = "";
          void uploadFiles(selectedFiles);
        }}
      />

      <input
        id={folderInputId ?? (inputId ? `${inputId}-folder` : undefined)}
        aria-label="Choose folder"
        className="sr-only"
        multiple
        type="file"
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files ?? []);
          event.target.value = "";
          void uploadFiles(selectedFiles);
        }}
      />

      {status ? (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm font-medium ${
            status.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : status.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-line bg-surface text-ink"
          }`}
        >
          <span>{status.message}</span>
          {activeUpload ? (
            <button
              type="button"
              onClick={() => void cancelUpload()}
              className="inline-flex h-8 items-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink transition hover:border-muted"
            >
              Cancel upload
            </button>
          ) : null}
        </div>
      ) : null}

      {isDragging ? (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-md border-2 border-dashed border-accent bg-panel/90 px-4 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-accent text-white shadow-panel">
              <UploadCloud aria-hidden="true" className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">Drop into Inbox</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function browserRelativePath(file: File): string {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return typeof withRelativePath.webkitRelativePath === "string" ? withRelativePath.webkitRelativePath.trim() : "";
}

async function uploadErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error.length > 0 ? body.error : "Upload failed";
  } catch {
    return "Upload failed";
  }
}
