import React from "react";
import Image from "next/image";
import { Box, File, FileImage, FileVideo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CloudFile, FileFamily } from "@/lib/shared/types";

type FileGridProps = {
  files: CloudFile[];
  selectedFileId?: string | null;
  selectedFileIds?: string[];
  selectionMode?: "single" | "multiple";
  onSelectFile?: (file: CloudFile) => void;
  onToggleSelected?: (fileId: string) => void;
};

const familyIcons: Partial<Record<FileFamily, LucideIcon>> = {
  cad: Box,
  image: FileImage,
  video: FileVideo
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${formatNumber(kilobytes)} KB`;
  }

  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) {
    return `${formatNumber(megabytes)} MB`;
  }

  return `${(megabytes / 1024).toFixed(1)} GB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function FileGrid({
  files,
  selectedFileId = null,
  selectedFileIds = [],
  selectionMode = "single",
  onSelectFile,
  onToggleSelected
}: FileGridProps) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/70 px-4 py-8 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-md border border-line bg-panel text-accent">
          <File aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-sm font-semibold text-ink">No files yet</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted">Drop files into Inbox to stage them for projects.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Files">
      {files.map((file) => {
        const Icon = familyIcons[file.family] ?? File;
        const isSelected = selectedFileIds.includes(file.id);
        const isActive = selectedFileId === file.id || isSelected;
        const previewUrl = readyPreviewUrl(file);

        return (
          <div
            key={file.id}
            className={[
              "relative min-w-0 rounded-md border bg-panel shadow-panel transition hover:border-muted",
              isActive ? "border-accent ring-2 ring-accent/20" : "border-line"
            ].join(" ")}
          >
            {selectionMode === "multiple" ? (
              <input
                type="checkbox"
                aria-label={`Select ${file.name}`}
                checked={isSelected}
                onChange={() => onToggleSelected?.(file.id)}
                className="absolute right-3 top-3 h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
            ) : null}
            <button
              type="button"
              aria-label={file.name}
              aria-pressed={selectedFileId === file.id}
              onClick={() => onSelectFile?.(file)}
              className="block min-w-0 rounded-md p-3 text-left"
            >
              <div className="flex min-w-0 items-start gap-3 pr-7">
                {previewUrl ? (
                  <Image
                    unoptimized
                    src={previewUrl}
                    alt={`Preview of ${file.name}`}
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-md border border-line bg-surface object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-ink">{file.name}</h3>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{formatBytes(file.sizeBytes)}</span>
                    <span className="truncate">{file.sourceDevice}</span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function readyPreviewUrl(file: CloudFile): string | null {
  return file.preview?.status === "ready" && file.preview.previewPath ? `/api/files/${encodeURIComponent(file.id)}/preview` : null;
}
