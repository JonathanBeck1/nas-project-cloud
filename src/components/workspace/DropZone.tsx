"use client";

import React, { useState } from "react";
import { UploadCloud } from "lucide-react";
import type { CloudFile } from "@/lib/shared/types";

type DropZoneProps = {
  children: React.ReactNode;
  inputId?: string;
  onUploaded?: (files: CloudFile[]) => void;
  chunkedUploadThresholdBytes?: number;
  chunkSizeBytes?: number;
};

type UploadStatus = {
  tone: "loading" | "success" | "error";
  message: string;
};

const DEFAULT_CHUNKED_UPLOAD_THRESHOLD_BYTES = 64 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

export function DropZone({
  children,
  inputId,
  onUploaded,
  chunkedUploadThresholdBytes = DEFAULT_CHUNKED_UPLOAD_THRESHOLD_BYTES,
  chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES
}: DropZoneProps) {
  const [dragDepth, setDragDepth] = useState(0);
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const isDragging = dragDepth > 0;

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    try {
      const uploadedFiles: CloudFile[] = [];

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
        tone: "error",
        message: error instanceof Error ? error.message : "Upload failed"
      });
    }
  }

  async function uploadSingle(file: File): Promise<CloudFile> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceDevice", "Browser");

    const response = await fetch("/api/files", {
      method: "POST",
      body: formData
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
    const sessionResponse = await fetch("/api/upload-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name || "upload.bin",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        sourceDevice: "Browser"
      })
    });

    if (!sessionResponse.ok) {
      throw new Error(await uploadErrorMessage(sessionResponse));
    }

    const sessionBody = (await sessionResponse.json()) as { session?: { id?: string } };
    const sessionId = sessionBody.session?.id;
    if (!sessionId) {
      throw new Error("Upload failed");
    }

    for (let offset = 0; offset < file.size; offset += chunkSizeBytes) {
      const end = Math.min(offset + chunkSizeBytes, file.size);
      setStatus({ tone: "loading", message: `Uploading ${file.name} ${end}/${file.size}` });
      const chunkResponse = await fetch(`/api/upload-sessions/${sessionId}/chunk`, {
        method: "POST",
        headers: { "upload-offset": String(offset) },
        body: file.slice(offset, end)
      });

      if (!chunkResponse.ok) {
        throw new Error(await uploadErrorMessage(chunkResponse));
      }
    }

    const completeResponse = await fetch(`/api/upload-sessions/${sessionId}/complete`, {
      method: "POST"
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

      {status ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-md border px-3 py-2 text-sm font-medium ${
            status.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : status.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-line bg-surface text-ink"
          }`}
        >
          {status.message}
        </p>
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

async function uploadErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error.length > 0 ? body.error : "Upload failed";
  } catch {
    return "Upload failed";
  }
}
