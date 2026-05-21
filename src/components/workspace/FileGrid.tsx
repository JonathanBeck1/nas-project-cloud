import React from "react";
import Image from "next/image";
import { Box, Download, File, FileImage, FileVideo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CloudFile, FileFamily, FilePreviewStatus } from "@/lib/shared/types";

export type FileGridMode = "grid" | "list";

type FileGridProps = {
  files: CloudFile[];
  selectedFileId?: string | null;
  selectedFileIds?: string[];
  selectionMode?: "single" | "multiple";
  mode?: FileGridMode;
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

function formatRelativeUpdated(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }
  const diffMs = Date.now() - parsed;
  if (diffMs < 60_000) {
    return "just now";
  }
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function emptyState() {
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

export function FileGrid({
  files,
  selectedFileId = null,
  selectedFileIds = [],
  selectionMode = "single",
  mode = "grid",
  onSelectFile,
  onToggleSelected
}: FileGridProps) {
  if (files.length === 0) {
    return emptyState();
  }

  if (mode === "list") {
    return (
      <ListView
        files={files}
        selectedFileId={selectedFileId}
        selectedFileIds={selectedFileIds}
        selectionMode={selectionMode}
        onSelectFile={onSelectFile}
        onToggleSelected={onToggleSelected}
      />
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
                    {previewStatusLabel(file) ? (
                      <span className={previewStatusClass(file.preview?.status)}>{previewStatusLabel(file)}</span>
                    ) : null}
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

type ListViewProps = Required<Pick<FileGridProps, "files">> &
  Pick<FileGridProps, "selectedFileId" | "selectedFileIds" | "selectionMode" | "onSelectFile" | "onToggleSelected">;

function ListView({
  files,
  selectedFileId = null,
  selectedFileIds = [],
  selectionMode = "single",
  onSelectFile,
  onToggleSelected
}: ListViewProps) {
  const showSelection = selectionMode === "multiple";

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <table className="min-w-full text-left text-sm" aria-label="Files">
        <thead className="border-b border-line bg-surface/50 text-xs uppercase tracking-wide text-muted">
          <tr>
            {showSelection ? <th scope="col" className="w-10 px-3 py-2" aria-label="Select" /> : null}
            <th scope="col" className="px-3 py-2 font-semibold">
              Name
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Size
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Type
            </th>
            <th scope="col" className="hidden px-3 py-2 font-semibold md:table-cell">
              Source
            </th>
            <th scope="col" className="hidden px-3 py-2 font-semibold lg:table-cell">
              Updated
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {files.map((file) => {
            const isSelected = selectedFileIds.includes(file.id);
            const isActive = selectedFileId === file.id || isSelected;

            return (
              <tr
                key={file.id}
                className={[
                  "transition hover:bg-line/30",
                  isActive ? "bg-accent/5" : ""
                ].join(" ")}
              >
                {showSelection ? (
                  <td className="w-10 px-3 py-2 align-middle">
                    <input
                      type="checkbox"
                      aria-label={`Select ${file.name}`}
                      checked={isSelected}
                      onChange={() => onToggleSelected?.(file.id)}
                      className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2 align-middle">
                  <button
                    type="button"
                    aria-label={file.name}
                    aria-pressed={selectedFileId === file.id}
                    onClick={() => onSelectFile?.(file)}
                    className="block w-full truncate text-left text-sm font-semibold text-ink hover:text-accent"
                  >
                    {file.name}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-muted">
                  {formatBytes(file.sizeBytes)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-xs uppercase tracking-wide text-muted">
                  {file.family}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 align-middle text-xs text-muted md:table-cell">
                  {file.sourceDevice}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 align-middle text-xs text-muted lg:table-cell">
                  {formatRelativeUpdated(file.updatedAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-right">
                  {file.status === "active" ? (
                    <a
                      href={`/api/files/${encodeURIComponent(file.id)}/download`}
                      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      Download
                    </a>
                  ) : (
                    <span className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
                      Archived
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function readyPreviewUrl(file: CloudFile): string | null {
  return file.preview?.status === "ready" && file.preview.previewPath ? `/api/files/${encodeURIComponent(file.id)}/preview` : null;
}

function previewStatusLabel(file: CloudFile): string | null {
  if (!file.preview || file.preview.status === "ready") {
    return null;
  }

  return `Preview ${file.preview.status}`;
}

function previewStatusClass(status: FilePreviewStatus | undefined): string {
  if (status === "failed") {
    return "rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 font-medium text-red-700";
  }
  if (status === "skipped") {
    return "rounded-md border border-line bg-surface px-1.5 py-0.5 font-medium text-muted";
  }
  return "rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700";
}
