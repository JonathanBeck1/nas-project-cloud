"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, UploadCloud } from "lucide-react";
import { CommandBar } from "./CommandBar";
import { BulkActionBar } from "./BulkActionBar";
import { DetailDrawer } from "./DetailDrawer";
import { DropZone } from "./DropZone";
import { FileGrid } from "./FileGrid";
import { MobileNavTrigger } from "./MobileNavTrigger";
import { ProjectDialog } from "./ProjectDialog";
import { Sidebar } from "./Sidebar";
import { UploadCenter } from "./UploadCenter";
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
import { csrfHeaders } from "@/lib/client/csrf";
import type { Category, CloudFile, FileShareLink, Project, Tag } from "@/lib/shared/types";
import type { WorkspaceData } from "@/lib/server/workspaceData";
import type { CreateShareLinkOptions } from "./DetailDrawer";
import type { ProjectDialogInput } from "./ProjectDialog";
import type { FileGridMode } from "./FileGrid";

type AppShellProps = {
  initialData?: WorkspaceData;
  initialFiles?: CloudFile[];
};

const SEARCH_DEBOUNCE_MS = 200;
const VIEW_MODE_STORAGE_KEY = "nas-cloud:viewMode";

type SearchStatus = "idle" | "loading" | "success" | "error";

function readStoredViewMode(): FileGridMode {
  if (typeof window === "undefined") {
    return "grid";
  }
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return raw === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function AppShell({ initialData, initialFiles = [] }: AppShellProps) {
  const [files, setFiles] = useState<CloudFile[]>(initialData?.files ?? initialFiles);
  const [projects, setProjects] = useState<Project[]>(initialData?.projects ?? []);
  const [categories] = useState<Category[]>(initialData?.categories ?? []);
  const [tags] = useState<Tag[]>(initialData?.tags ?? []);
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<CloudFile[]>([]);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<FileGridMode>("grid");

  useEffect(() => {
    setViewMode(readStoredViewMode());
  }, []);

  const handleViewModeChange = (mode: FileGridMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
      } catch {
        // localStorage can be unavailable (private mode, quota); fall back gracefully.
      }
    }
  };
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [fileActionMessage, setFileActionMessage] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const [isFileActionBusy, setIsFileActionBusy] = useState(false);

  const trimmedQuery = query.trim();
  const isQueryActive = trimmedQuery.length > 0;

  useEffect(() => {
    if (!isQueryActive) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setSearchStatus("idle");
      setSearchResults([]);
      setSearchTruncated(false);
      setSearchError(null);
      return;
    }

    const handle = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setSearchStatus("loading");
      setSearchError(null);

      const url = `/api/search?q=${encodeURIComponent(trimmedQuery)}`;
      void fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Search failed");
          }
          return (await response.json()) as { files?: CloudFile[]; truncated?: boolean };
        })
        .then((body) => {
          if (controller.signal.aborted) {
            return;
          }
          setSearchResults(body.files ?? []);
          setSearchTruncated(Boolean(body.truncated));
          setSearchStatus("success");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
            return;
          }
          setSearchError(error instanceof Error ? error.message : "Search failed");
          setSearchStatus("error");
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [isQueryActive, trimmedQuery]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  const visibleFiles = isQueryActive ? searchResults : files;
  const isSearching = isQueryActive && searchStatus === "loading";
  const showTruncationBanner = isQueryActive && searchStatus === "success" && searchTruncated;
  const searchErrorMessage = isQueryActive && searchStatus === "error" ? searchError : null;
  const selectedFile = visibleFiles.find((file) => file.id === selectedFileId) ?? null;
  const selectedBulkFiles = files.filter((file) => selectedFileIds.includes(file.id));
  const selectedBulkDownloadHref =
    selectedFileIds.length > 0 ? bulkDownloadUrl(selectedFileIds) : undefined;

  const replaceFile = (updated: CloudFile) => {
    setFiles((currentFiles) => currentFiles.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
    setSearchResults((currentFiles) => currentFiles.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
  };

  const handleCreateProject = async (project: ProjectDialogInput) => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(project)
    });

    let payload: { project?: Project; error?: string; message?: string } = {};
    try {
      payload = (await response.json()) as { project?: Project; error?: string; message?: string };
    } catch {
      payload = {};
    }

    if (!response.ok || !payload.project) {
      let message = "Could not create project";
      message = payload.error ?? payload.message ?? (response.statusText ? `Could not create project: ${response.statusText}` : message);

      throw new Error(message);
    }

    setProjects((currentProjects) => [payload.project!, ...currentProjects]);
    setFileActionError("");
    setFileActionMessage(`Created project ${payload.project.name}`);
  };

  const handleArchiveFile = async (file: CloudFile) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      await archiveFile(file.id);
      setFiles((currentFiles) => currentFiles.filter((candidate) => candidate.id !== file.id));
      setSelectedFileId((currentSelectedId) => (currentSelectedId === file.id ? null : currentSelectedId));
      setSelectedFileIds((currentSelectedIds) => currentSelectedIds.filter((candidate) => candidate !== file.id));
      setFileActionMessage(`Archived ${file.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not archive file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleToggleSelectedFile = (fileId: string) => {
    setSelectedFileIds((currentSelectedIds) =>
      currentSelectedIds.includes(fileId)
        ? currentSelectedIds.filter((candidate) => candidate !== fileId)
        : [...currentSelectedIds, fileId]
    );
  };

  const handleArchiveSelectedFiles = async () => {
    if (selectedBulkFiles.length === 0) {
      return;
    }

    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");

    try {
      await Promise.all(selectedBulkFiles.map((file) => archiveFile(file.id)));
      const archivedIds = new Set(selectedBulkFiles.map((file) => file.id));
      setFiles((currentFiles) => currentFiles.filter((file) => !archivedIds.has(file.id)));
      setSelectedFileId((currentSelectedId) => (currentSelectedId && archivedIds.has(currentSelectedId) ? null : currentSelectedId));
      setSelectedFileIds([]);
      setFileActionMessage(`Archived ${selectedBulkFiles.length} ${selectedBulkFiles.length === 1 ? "file" : "files"}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not archive selected files");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleAssignSelectedFiles = async (input: { projectId: string | null; categoryId: string | null }) => {
    if (selectedBulkFiles.length === 0) {
      return;
    }

    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");

    try {
      const updatedFiles = await Promise.all(
        selectedBulkFiles.map((file) =>
          updateFileAssignment(file.id, { projectId: input.projectId, categoryId: input.categoryId })
        )
      );
      const updatedFilesById = new Map(updatedFiles.map((file) => [file.id, file]));

      setFiles((currentFiles) => currentFiles.map((file) => updatedFilesById.get(file.id) ?? file));
      setSearchResults((currentFiles) => currentFiles.map((file) => updatedFilesById.get(file.id) ?? file));
      setSelectedFileIds([]);
      setFileActionMessage(`Updated ${updatedFiles.length} ${updatedFiles.length === 1 ? "file" : "files"}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not update selected files");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleAssignProject = async (file: CloudFile, projectId: string) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const updated = await updateFileAssignment(file.id, { projectId: projectId || null });
      replaceFile(updated);
      setSelectedFileId((currentSelectedId) => (currentSelectedId === file.id ? updated.id : currentSelectedId));
      setFileActionMessage(`Updated ${updated.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not update file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleRenameFile = async (file: CloudFile, name: string) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const updated = await renameFile(file.id, name);
      replaceFile(updated);
      setFileActionMessage(`Renamed ${updated.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not rename file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleAssignTags = async (file: CloudFile, tagIds: string[]) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const updated = await setFileTagsRequest(file.id, tagIds);
      replaceFile(updated);
      setFileActionMessage(`Updated tags on ${updated.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not update tags");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  const handleCreateShareLink = useCallback(async (file: CloudFile, options: CreateShareLinkOptions) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const result = await createFileShareLink(file.id, options);
      setFileActionMessage(`Created share link for ${file.name}`);
      return { ...result, url: absoluteShareUrl(result.url) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create share link";
      setFileActionError(message);
      throw new Error(message);
    } finally {
      setIsFileActionBusy(false);
    }
  }, []);

  const handleListShareLinks = useCallback(async (file: CloudFile) => listFileShareLinks(file.id), []);

  const handleListShareAccessEvents = useCallback(
    async (file: CloudFile, share: FileShareLink) => listFileShareAccessEvents(file.id, share.id),
    []
  );

  const handleRevokeShareLink = useCallback(async (file: CloudFile, share: FileShareLink) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const revoked = await revokeFileShareLink(file.id, share.id);
      setFileActionMessage(`Revoked share link for ${file.name}`);
      return revoked;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not revoke share link";
      setFileActionError(message);
      throw new Error(message);
    } finally {
      setIsFileActionBusy(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden min-h-0 md:block">
          <Sidebar projects={projects} activeHref="/" />
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
            <MobileNavTrigger projects={projects} activeHref="/" />
            <p className="truncate text-sm font-semibold text-ink">NAS Project Cloud</p>
          </div>
          <CommandBar
            query={query}
            onQueryChange={setQuery}
            uploadInputId="workspace-file-upload"
            isSearching={isSearching}
            viewMode={viewMode}
            onChangeViewMode={handleViewModeChange}
          />

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 lg:px-6">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-md border border-line bg-panel shadow-panel" aria-labelledby="inbox-heading">
                <div className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Local Library</p>
                    <h1 id="inbox-heading" className="mt-1 text-xl font-semibold text-ink">
                      {isQueryActive ? "Search" : "Inbox"}
                    </h1>
                    {isQueryActive ? (
                      <p className="mt-1 text-xs text-muted">
                        Showing results for &ldquo;{trimmedQuery}&rdquo;
                      </p>
                    ) : null}
                  </div>
                  <ProjectDialog onCreate={handleCreateProject} />
                </div>

                <div className="space-y-4 px-4 py-5">
                  <DropZone
                    inputId="workspace-file-upload"
                    folderInputId="workspace-folder-upload"
                    onUploaded={(uploadedFiles) => setFiles((currentFiles) => [...uploadedFiles, ...currentFiles])}
                  >
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/70 px-4 py-8 text-center">
                      <div className="grid h-12 w-12 place-items-center rounded-md border border-line bg-panel text-accent">
                        <Inbox aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <h2 className="mt-5 text-base font-semibold text-ink">Inbox</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                        Drop files here to move them onto the NAS now and organize them into projects when ready.
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        <label
                          htmlFor="workspace-file-upload"
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
                          htmlFor="workspace-folder-upload"
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
                    </div>
                  </DropZone>

                  <UploadCenter
                    initialSessions={initialData?.openUploadSessions ?? []}
                    onUploaded={(uploadedFiles) => setFiles((currentFiles) => [...uploadedFiles, ...currentFiles])}
                  />

                  {showTruncationBanner ? (
                    <p
                      role="status"
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
                    >
                      Showing the first 200 results. Refine the query to narrow them down.
                    </p>
                  ) : null}
                  {searchErrorMessage ? (
                    <p
                      role="alert"
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      {searchErrorMessage}
                    </p>
                  ) : null}
                  {fileActionMessage ? (
                    <p
                      role="status"
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                    >
                      {fileActionMessage}
                    </p>
                  ) : null}
                  {fileActionError ? (
                    <p
                      role="alert"
                      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      {fileActionError}
                    </p>
                  ) : null}

                  <div aria-label={isQueryActive ? "Search results" : "Inbox files"}>
                    <BulkActionBar
                      selectedCount={selectedFileIds.length}
                      projects={projects}
                      categories={categories}
                      isBusy={isFileActionBusy}
                      downloadHref={selectedBulkDownloadHref}
                      onArchive={handleArchiveSelectedFiles}
                      onApplyOrganization={handleAssignSelectedFiles}
                      onClearSelection={() => setSelectedFileIds([])}
                    />
                    <FileGrid
                      files={visibleFiles}
                      selectedFileId={selectedFileId}
                      selectedFileIds={selectedFileIds}
                      selectionMode="multiple"
                      mode={viewMode}
                      onSelectFile={(file) => setSelectedFileId(file.id)}
                      onToggleSelected={handleToggleSelectedFile}
                    />
                  </div>
                </div>
              </section>

              <div className="min-w-0 xl:sticky xl:top-5 xl:h-[calc(100vh-6.5rem)]">
                <DetailDrawer
                  file={selectedFile}
                  projects={projects}
                  availableTags={tags}
                  isBusy={isFileActionBusy}
                  onArchive={handleArchiveFile}
                  onRename={handleRenameFile}
                  onAssignProject={handleAssignProject}
                  onAssignTags={handleAssignTags}
                  onCreateShareLink={handleCreateShareLink}
                  onListShareLinks={handleListShareLinks}
                  onListShareAccessEvents={handleListShareAccessEvents}
                  onRevokeShareLink={handleRevokeShareLink}
                />
              </div>
            </div>
          </main>
        </div>
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
