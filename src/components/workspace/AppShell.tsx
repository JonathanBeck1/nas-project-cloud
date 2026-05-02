"use client";

import React, { useState } from "react";
import { Inbox, UploadCloud } from "lucide-react";
import { CommandBar } from "./CommandBar";
import { BulkActionBar } from "./BulkActionBar";
import { DetailDrawer } from "./DetailDrawer";
import { DropZone } from "./DropZone";
import { FileGrid } from "./FileGrid";
import { ProjectDialog } from "./ProjectDialog";
import { Sidebar } from "./Sidebar";
import { archiveFile, updateFileAssignment } from "@/lib/client/fileActions";
import type { CloudFile } from "@/lib/shared/types";
import type { WorkspaceData } from "@/lib/server/workspaceData";
import type { ProjectDialogInput } from "./ProjectDialog";

type AppShellProps = {
  initialData?: WorkspaceData;
  initialFiles?: CloudFile[];
};

export function AppShell({ initialData, initialFiles = [] }: AppShellProps) {
  const [files, setFiles] = useState<CloudFile[]>(initialData?.files ?? initialFiles);
  const [query, setQuery] = useState("");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [fileActionMessage, setFileActionMessage] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const [isFileActionBusy, setIsFileActionBusy] = useState(false);
  const visibleFiles = files.filter((file) => matchesQuery(file, query));
  const selectedFile = visibleFiles.find((file) => file.id === selectedFileId) ?? null;
  const selectedBulkFiles = files.filter((file) => selectedFileIds.includes(file.id));

  const handleCreateProject = async (project: ProjectDialogInput) => {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project)
    });

    if (!response.ok) {
      let message = "Could not create project";

      try {
        const payload = (await response.json()) as { error?: string; message?: string };
        message = payload.error ?? payload.message ?? message;
      } catch {
        message = response.statusText ? `Could not create project: ${response.statusText}` : message;
      }

      throw new Error(message);
    }
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

  const handleAssignProject = async (file: CloudFile, projectId: string) => {
    setIsFileActionBusy(true);
    setFileActionMessage("");
    setFileActionError("");
    try {
      const updated = await updateFileAssignment(file.id, { projectId: projectId || null });
      setFiles((currentFiles) => currentFiles.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setSelectedFileId((currentSelectedId) => (currentSelectedId === file.id ? updated.id : currentSelectedId));
      setFileActionMessage(`Updated ${updated.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not update file");
    } finally {
      setIsFileActionBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="min-h-0">
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-col">
          <CommandBar query={query} onQueryChange={setQuery} uploadInputId="workspace-file-upload" />

          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 lg:px-6">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-md border border-line bg-panel shadow-panel" aria-labelledby="inbox-heading">
                <div className="flex flex-col gap-4 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Local Library</p>
                    <h1 id="inbox-heading" className="mt-1 text-xl font-semibold text-ink">
                      Inbox
                    </h1>
                  </div>
                  <ProjectDialog onCreate={handleCreateProject} />
                </div>

                <div className="space-y-4 px-4 py-5">
                  <DropZone
                    inputId="workspace-file-upload"
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
                      <label
                        htmlFor="workspace-file-upload"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.currentTarget.control?.click();
                          }
                        }}
                        className="mt-6 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <UploadCloud aria-hidden="true" className="h-4 w-4" />
                        Drop files
                      </label>
                    </div>
                  </DropZone>

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

                  <div aria-label="Inbox files">
                    <BulkActionBar
                      selectedCount={selectedFileIds.length}
                      onArchive={handleArchiveSelectedFiles}
                      onClearSelection={() => setSelectedFileIds([])}
                    />
                    <FileGrid
                      files={visibleFiles}
                      selectedFileId={selectedFileId}
                      selectedFileIds={selectedFileIds}
                      selectionMode="multiple"
                      onSelectFile={(file) => setSelectedFileId(file.id)}
                      onToggleSelected={handleToggleSelectedFile}
                    />
                  </div>
                </div>
              </section>

              <div className="min-w-0 xl:sticky xl:top-5 xl:h-[calc(100vh-6.5rem)]">
                <DetailDrawer
                  file={selectedFile}
                  projects={initialData?.projects ?? []}
                  isBusy={isFileActionBusy}
                  onArchive={handleArchiveFile}
                  onAssignProject={handleAssignProject}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
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
