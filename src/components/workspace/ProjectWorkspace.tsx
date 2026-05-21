"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { archiveFile } from "@/lib/client/fileActions";
import type { Category, CloudFile, Project, Tag } from "@/lib/shared/types";
import { BulkActionBar } from "./BulkActionBar";
import { FileGrid } from "./FileGrid";

type ProjectWorkspaceProps = {
  project: Project;
  files: CloudFile[];
  categories: Category[];
  tags: Tag[];
};

export function ProjectWorkspace({ project, files: initialFiles, categories, tags }: ProjectWorkspaceProps) {
  const [files, setFiles] = useState(initialFiles);
  const [query, setQuery] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const visibleFiles = files.filter((file) => matchesQuery(file, query));
  const selectedBulkFiles = files.filter((file) => selectedFileIds.includes(file.id));

  const toggleSelectedFile = (fileId: string) => {
    setSelectedFileIds((currentSelectedIds) =>
      currentSelectedIds.includes(fileId)
        ? currentSelectedIds.filter((candidate) => candidate !== fileId)
        : [...currentSelectedIds, fileId]
    );
  };

  const archiveSelectedFiles = async () => {
    if (selectedBulkFiles.length === 0) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await Promise.all(selectedBulkFiles.map((file) => archiveFile(file.id)));
      const archivedIds = new Set(selectedBulkFiles.map((file) => file.id));
      setFiles((currentFiles) => currentFiles.filter((file) => !archivedIds.has(file.id)));
      setSelectedFileId((currentSelectedId) => (currentSelectedId && archivedIds.has(currentSelectedId) ? null : currentSelectedId));
      setSelectedFileIds([]);
      setMessage(`Archived ${selectedBulkFiles.length} ${selectedBulkFiles.length === 1 ? "file" : "files"}`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not archive selected files");
    }
  };

  return (
    <section className="rounded-md border border-line bg-panel shadow-panel" aria-labelledby="project-heading">
          <div className="flex flex-col gap-4 border-b border-line px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Project Workspace</p>
              <h1 id="project-heading" className="mt-1 truncate text-2xl font-semibold text-ink">
                {project.name}
              </h1>
              {project.description ? <p className="mt-2 text-sm leading-6 text-muted">{project.description}</p> : null}
            </div>
            <dl className="grid grid-cols-3 gap-3 text-right text-xs text-muted">
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em]">Files</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{files.length}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em]">Categories</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{categories.length}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.08em]">Tags</dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{tags.length}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-4 px-4 py-5">
            <label className="relative block max-w-lg">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                aria-label="Search project files"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search project files"
                className="h-10 w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>

            {message ? (
              <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {message}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <BulkActionBar
              selectedCount={selectedFileIds.length}
              onArchive={archiveSelectedFiles}
              onClearSelection={() => setSelectedFileIds([])}
            />
            <FileGrid
              files={visibleFiles}
              selectedFileId={selectedFileId}
              selectedFileIds={selectedFileIds}
              selectionMode="multiple"
              onSelectFile={(file) => setSelectedFileId(file.id)}
              onToggleSelected={toggleSelectedFile}
            />
          </div>
    </section>
  );
}

function matchesQuery(file: CloudFile, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [file.name, file.storagePath, file.sourceDevice, file.extension, file.family].some((value) =>
    value.toLowerCase().includes(normalized)
  );
}
