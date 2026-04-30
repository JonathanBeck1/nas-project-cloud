"use client";

import React, { useState } from "react";
import { Inbox, UploadCloud } from "lucide-react";
import { CommandBar } from "./CommandBar";
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
  const [fileActionMessage, setFileActionMessage] = useState("");
  const [fileActionError, setFileActionError] = useState("");
  const [isFileActionBusy, setIsFileActionBusy] = useState(false);
  const visibleFiles = files.filter((file) => matchesQuery(file, query));
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null;

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
      setFileActionMessage(`Archived ${file.name}`);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "Could not archive file");
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
          <CommandBar query={query} onQueryChange={setQuery} />

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
                  <DropZone onUploaded={(uploadedFiles) => setFiles((currentFiles) => [...uploadedFiles, ...currentFiles])}>
                    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface/70 px-4 py-8 text-center">
                      <div className="grid h-12 w-12 place-items-center rounded-md border border-line bg-panel text-accent">
                        <Inbox aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <h2 className="mt-5 text-base font-semibold text-ink">Inbox</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                        Drop files here to move them onto the NAS now and organize them into projects when ready.
                      </p>
                      <button
                        type="button"
                        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
                      >
                        <UploadCloud aria-hidden="true" className="h-4 w-4" />
                        Drop files
                      </button>
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
                    <FileGrid
                      files={visibleFiles}
                      selectedFileId={selectedFileId}
                      onSelectFile={(file) => setSelectedFileId(file.id)}
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
