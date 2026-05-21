"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, Settings, Trash2, X } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { Category, Project, ProjectStatus } from "@/lib/shared/types";

type ProjectSettingsCardProps = {
  project: Project;
  categories: Category[];
  fileCount: number;
};

const projectStatuses: Array<{ value: ProjectStatus; label: string; description: string }> = [
  { value: "active", label: "Active", description: "Default state. Sidebar list, regular projects." },
  { value: "paused", label: "Paused", description: "Still listed, but obviously on hold." },
  { value: "complete", label: "Complete", description: "Finished projects you want to keep visible." },
  { value: "archived", label: "Archived", description: "Hidden from default views (no auto-hide yet)." }
];

export function ProjectSettingsCard({ project: initialProject, categories, fileCount }: ProjectSettingsCardProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialProject.name);
  const [description, setDescription] = useState(initialProject.description);
  const [status, setStatus] = useState<ProjectStatus>(initialProject.status);
  const [categoryId, setCategoryId] = useState<string>(initialProject.categoryId ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [busyAction, setBusyAction] = useState<"save" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const saveChanges = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    setBusyAction("save");
    setMessage("");
    setError("");

    const payload: Record<string, unknown> = {};
    if (trimmedName !== project.name) payload.name = trimmedName;
    if (description !== project.description) payload.description = description;
    if (status !== project.status) payload.status = status;
    if ((categoryId || null) !== (project.categoryId ?? null)) {
      payload.categoryId = categoryId === "" ? null : categoryId;
    }

    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      setBusyAction(null);
      return;
    }

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify(payload)
      });
      const responsePayload = (await safeJson(response)) as { project?: Project; error?: string };

      if (!response.ok || !responsePayload.project) {
        throw new Error(responsePayload.error ?? "Could not update project");
      }

      setProject(responsePayload.project);
      setName(responsePayload.project.name);
      setDescription(responsePayload.project.description);
      setStatus(responsePayload.project.status);
      setCategoryId(responsePayload.project.categoryId ?? "");
      setIsEditing(false);
      setMessage("Project updated");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update project");
    } finally {
      setBusyAction(null);
    }
  };

  const deleteProject = async () => {
    if (confirmName.trim() !== project.name) {
      setError("Type the project name exactly to confirm");
      return;
    }

    setBusyAction("delete");
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE",
        headers: { ...csrfHeaders() }
      });
      const payload = (await safeJson(response)) as {
        ok?: boolean;
        detachedFiles?: number;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not delete project");
      }

      const detached = payload.detachedFiles ?? 0;
      const suffix = detached > 0 ? ` ${detached} ${detached === 1 ? "file" : "files"} returned to inbox.` : "";
      setMessage(`Deleted ${project.name}.${suffix} Redirecting...`);
      router.push("/projects");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete project");
      setBusyAction(null);
    }
  };

  return (
    <section className="rounded-md border border-line bg-panel shadow-panel" aria-labelledby="project-settings-heading">
      <header className="flex items-start gap-3 border-b border-line px-4 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <Settings aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Project</p>
          <h2 id="project-settings-heading" className="mt-1 text-base font-semibold text-ink">
            Settings
          </h2>
          <p className="mt-1 text-sm text-muted">
            Status: <span className="font-semibold text-ink">{project.status}</span>
            {fileCount > 0 ? ` | ${fileCount} ${fileCount === 1 ? "file" : "files"}` : ""}
          </p>
        </div>
        {!isEditing ? (
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setMessage("");
              setError("");
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            Edit
          </button>
        ) : null}
      </header>

      <div className="space-y-4 px-4 py-4">
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

        {isEditing ? (
          <form className="space-y-3" onSubmit={saveChanges}>
            <label className="block text-sm font-semibold text-ink">
              Name
              <input
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={2000}
                className="mt-2 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ProjectStatus)}
                className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                {projectStatuses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-ink">
              Category
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busyAction === "save"}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                Save changes
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setName(project.name);
                  setDescription(project.description);
                  setStatus(project.status);
                  setCategoryId(project.categoryId ?? "");
                  setError("");
                }}
                disabled={busyAction === "save"}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <ReadOnlyRow label="Description" value={project.description || "(no description)"} />
            <ReadOnlyRow
              label="Status"
              value={projectStatuses.find((option) => option.value === project.status)?.description ?? project.status}
            />
            <ReadOnlyRow
              label="Category"
              value={
                project.categoryId
                  ? categories.find((category) => category.id === project.categoryId)?.name ?? "Unknown"
                  : "No category"
              }
            />
            <ReadOnlyRow label="Slug" value={project.slug} mono />
          </dl>
        )}

        <div className="rounded-md border border-red-200 bg-red-50/50 px-3 py-3">
          <p className="text-sm font-semibold text-red-700">Delete project</p>
          <p className="mt-1 text-xs leading-5 text-red-700/80">
            Deleting removes the project entry. Files keep living on disk under{" "}
            <code className="rounded bg-red-100 px-1 py-0.5 font-mono">Projects/{project.slug}/Inbox/</code>; their
            metadata gets detached and they show up in the inbox view.
          </p>
          <label className="mt-3 block text-xs font-semibold text-red-700">
            Type <span className="font-mono">{project.name}</span> to confirm
            <input
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-red-200 bg-white px-3 text-sm text-ink"
              placeholder={project.name}
            />
          </label>
          <button
            type="button"
            onClick={deleteProject}
            disabled={busyAction === "delete" || confirmName.trim() !== project.name}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md border border-red-300 bg-red-100 px-3 text-sm font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Delete project
          </button>
        </div>
      </div>
    </section>
  );
}

function ReadOnlyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 ${mono ? "font-mono text-xs" : "text-sm"} font-medium text-ink`}>{value}</dd>
    </div>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
