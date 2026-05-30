"use client";

import React, { useCallback, useState } from "react";
import { Download, Search, UploadCloud } from "lucide-react";
import {
  archiveFile,
  createFileShareLink,
  listFileShareAccessEvents,
  listFileShareLinks,
  renameFile,
  revokeFileShareLink,
  setFileTags as setFileTagsRequest,
  updateFileAssignment
} from "@/lib/client/fileActions";
import type { Category, CloudFile, FileShareLink, Project, Tag } from "@/lib/shared/types";
import { BulkActionBar } from "./BulkActionBar";
import { DetailDrawer } from "./DetailDrawer";
import type { CreateShareLinkOptions } from "./DetailDrawer";
import { DropZone } from "./DropZone";
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
  const [isFileActionBusy, setIsFileActionBusy] = useState(false);
  const fileInputId = `project-file-upload-${project.id}`;
  const folderInputId = `project-folder-upload-${project.id}`;
  const visibleFiles = files.filter((file) => matchesQuery(file, query));
  const selectedFile = visibleFiles.find((file) => file.id === selectedFileId) ?? null;
  const selectedBulkFiles = files.filter((file) => selectedFileIds.includes(file.id));
  const selectedBulkDownloadHref =
    selectedFileIds.length > 0 ? bulkDownloadUrl(selectedFileIds) : undefined;

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

  const replaceOrRemoveFile = (updated: CloudFile) => {
    if (updated.projectId !== project.id || updated.status !== "active") {
      setFiles((currentFiles) => currentFiles.filter((file) => file.id !== updated.id));
      setSelectedFileId((currentSelectedId) => (currentSelectedId === updated.id ? null : currentSelectedId));
      setSelectedFileIds((currentSelectedIds) => currentSelectedIds.filter((fileId) => fileId !== updated.id));
      return;
    }

    setFiles((currentFiles) => currentFiles.map((file) => (file.id === updated.id ? updated : file)));
  };

  const archiveSingleFile = async (file: CloudFile) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      await archiveFile(file.id);
      setFiles((currentFiles) => currentFiles.filter((candidate) => candidate.id !== file.id));
      setSelectedFileId((currentSelectedId) => (currentSelectedId === file.id ? null : currentSelectedId));
      setSelectedFileIds((currentSelectedIds) => currentSelectedIds.filter((candidate) => candidate !== file.id));
      setMessage(`Archived ${file.name}`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not archive file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const renameSingleFile = async (file: CloudFile, name: string) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      const updated = await renameFile(file.id, name);
      replaceOrRemoveFile(updated);
      setMessage(`Renamed ${updated.name}`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const assignProject = async (file: CloudFile, projectId: string) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      const updated = await updateFileAssignment(file.id, { projectId: projectId || null });
      replaceOrRemoveFile(updated);
      setMessage(`Updated ${updated.name}`);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not update file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const assignTags = async (file: CloudFile, tagIds: string[]) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      const updated = await setFileTagsRequest(file.id, tagIds);
      replaceOrRemoveFile(updated);
      setMessage(`Updated tags on ${updated.name}`);
    } catch (tagError) {
      setError(tagError instanceof Error ? tagError.message : "Could not update tags");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const createShare = useCallback(async (file: CloudFile, options: CreateShareLinkOptions) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      const result = await createFileShareLink(file.id, options);
      setMessage(`Created share link for ${file.name}`);
      return { ...result, url: absoluteShareUrl(result.url) };
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Could not create share link";
      setError(message);
      throw new Error(message);
    } finally {
      setIsFileActionBusy(false);
    }
  }, []);

  const listShares = useCallback(async (file: CloudFile) => listFileShareLinks(file.id), []);

  const listShareAccessEvents = useCallback(
    async (file: CloudFile, share: FileShareLink) => listFileShareAccessEvents(file.id, share.id),
    []
  );

  const revokeShare = useCallback(async (file: CloudFile, share: FileShareLink) => {
    setIsFileActionBusy(true);
    setMessage("");
    setError("");

    try {
      const revoked = await revokeFileShareLink(file.id, share.id);
      setMessage(`Revoked share link for ${file.name}`);
      return revoked;
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Could not revoke share link";
      setError(message);
      throw new Error(message);
    } finally {
      setIsFileActionBusy(false);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-md border border-line bg-panel shadow-panel" aria-labelledby="project-heading">
          <div className="flex flex-col gap-4 border-b border-line px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Project Workspace</p>
              <h1 id="project-heading" className="mt-1 truncate text-2xl font-semibold text-ink">
                {project.name}
              </h1>
              {project.description ? <p className="mt-2 text-sm leading-6 text-muted">{project.description}</p> : null}
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end md:flex-col md:items-end">
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
              <a
                href={`/api/projects/${encodeURIComponent(project.id)}/download`}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download project ZIP
              </a>
            </div>
          </div>

          <div className="space-y-4 px-4 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block w-full max-w-lg">
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

              <DropZone
                inputId={fileInputId}
                folderInputId={folderInputId}
                projectId={project.id}
                projectSlug={project.slug}
                onUploaded={(uploadedFiles) => setFiles((currentFiles) => [...uploadedFiles, ...currentFiles])}
              >
                <div className="flex flex-wrap gap-2">
                  <label
                    htmlFor={fileInputId}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.currentTarget.control?.click();
                      }
                    }}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <UploadCloud aria-hidden="true" className="h-4 w-4" />
                    Choose files
                  </label>
                  <label
                    htmlFor={folderInputId}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.currentTarget.control?.click();
                      }
                    }}
                    className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <UploadCloud aria-hidden="true" className="h-4 w-4" />
                    Choose folder
                  </label>
                </div>
              </DropZone>
            </div>

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
              isBusy={isFileActionBusy}
              downloadHref={selectedBulkDownloadHref}
              onArchive={archiveSelectedFiles}
              onClearSelection={() => setSelectedFileIds([])}
            />
            <FileGrid
              files={visibleFiles}
              selectedFileId={selectedFileId}
              selectedFileIds={selectedFileIds}
              selectionMode="multiple"
              emptyMessage="Choose files or a folder to add project assets here."
              onSelectFile={(file) => setSelectedFileId(file.id)}
              onToggleSelected={toggleSelectedFile}
            />
          </div>
      </section>

      <div className="min-w-0 xl:sticky xl:top-5 xl:h-[calc(100vh-6.5rem)]">
        <DetailDrawer
          file={selectedFile}
          projects={[project]}
          availableTags={tags}
          isBusy={isFileActionBusy}
          onArchive={archiveSingleFile}
          onRename={renameSingleFile}
          onAssignProject={assignProject}
          onAssignTags={assignTags}
          onCreateShareLink={createShare}
          onListShareLinks={listShares}
          onListShareAccessEvents={listShareAccessEvents}
          onRevokeShareLink={revokeShare}
        />
      </div>
    </div>
  );
}

function absoluteShareUrl(url: string): string {
  if (typeof window === "undefined") {
    return url;
  }
  return new URL(url, window.location.origin).toString();
}

function bulkDownloadUrl(fileIds: string[]): string {
  const params = new URLSearchParams();
  for (const fileId of fileIds) {
    params.append("fileIds", fileId);
  }
  return `/api/files/bulk/download?${params.toString()}`;
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
