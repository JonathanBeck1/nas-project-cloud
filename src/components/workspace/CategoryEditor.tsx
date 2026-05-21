"use client";

import React, { useMemo, useState } from "react";
import { Pencil, Plus, Save, Tags, Trash2, X } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { Category } from "@/lib/shared/types";

type CategoryUsage = {
  categoryId: string;
  fileCount: number;
};

type CategoryEditorProps = {
  categories: Category[];
  usage: CategoryUsage[];
};

const defaultPalette = [
  "#0F62FE",
  "#42BE65",
  "#F1C21B",
  "#FF6F00",
  "#DA1E28",
  "#8A3FFC",
  "#0E8A7B",
  "#525252"
];

export function CategoryEditor({ categories: initialCategories, usage }: CategoryEditorProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultPalette[0]);
  const [busyAction, setBusyAction] = useState<"create" | string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#000000");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const usageById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of usage) {
      map.set(entry.categoryId, entry.fileCount);
    }
    return map;
  }, [usage]);

  const beginEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color);
    setMessage("");
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("#000000");
  };

  const createCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setBusyAction("create");
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ name: trimmedName, color })
      });
      const payload = (await safeJson(response)) as { category?: Category; error?: string };

      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Could not create category");
      }

      setCategories((current) =>
        [...current, payload.category!].sort((a, b) =>
          a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder
        )
      );
      setName("");
      setMessage(`Created ${payload.category.name}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create category");
    } finally {
      setBusyAction(null);
    }
  };

  const saveEdit = async (category: Category) => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Name cannot be empty");
      return;
    }

    setBusyAction(category.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ name: trimmedName, color: editColor })
      });
      const payload = (await safeJson(response)) as { category?: Category; error?: string };

      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Could not update category");
      }

      setCategories((current) =>
        current.map((candidate) => (candidate.id === payload.category!.id ? payload.category! : candidate))
      );
      setMessage(`Updated ${payload.category.name}`);
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update category");
    } finally {
      setBusyAction(null);
    }
  };

  const deleteCategory = async (category: Category) => {
    const fileCount = usageById.get(category.id) ?? 0;
    const confirmation = fileCount > 0
      ? `Delete the "${category.name}" category? ${fileCount} ${fileCount === 1 ? "file" : "files"} will become uncategorized.`
      : `Delete the "${category.name}" category?`;

    if (!window.confirm(confirmation)) return;

    setBusyAction(category.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/categories/${encodeURIComponent(category.id)}`, {
        method: "DELETE",
        headers: { ...csrfHeaders() }
      });
      const payload = (await safeJson(response)) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not delete category");
      }

      setCategories((current) => current.filter((candidate) => candidate.id !== category.id));
      setMessage(`Deleted ${category.name}`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete category");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-md border border-line bg-panel shadow-panel" aria-labelledby="categories-heading">
        <div className="border-b border-line px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Organization</p>
          <h2 id="categories-heading" className="mt-1 text-base font-semibold text-ink">
            Categories
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            System categories ship with the app and can&apos;t be edited. Custom categories you add here can be
            renamed, recolored, or deleted at any time.
          </p>
        </div>

        <ul className="divide-y divide-line" aria-label="Categories">
          {categories.map((category) => {
            const fileCount = usageById.get(category.id) ?? 0;
            const isEditing = editingId === category.id;
            const isBusy = busyAction === category.id;

            return (
              <li key={category.id} className="px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line text-white"
                    style={{ backgroundColor: isEditing ? editColor : category.color }}
                    aria-hidden="true"
                  >
                    <Tags className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          aria-label="Category name"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink"
                        />
                        <input
                          aria-label="Category color"
                          type="color"
                          value={editColor}
                          onChange={(event) => setEditColor(event.target.value)}
                          className="h-9 w-12 rounded-md border border-line bg-surface"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-sm font-semibold text-ink">{category.name}</p>
                        <p className="mt-1 text-xs text-muted">
                          {fileCount} {fileCount === 1 ? "file" : "files"} | slug {category.slug}
                          {category.isSystem ? " | system" : ""}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEdit(category)}
                          disabled={isBusy}
                          aria-label={`Save ${category.name}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Save aria-hidden="true" className="h-3.5 w-3.5" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isBusy}
                          aria-label="Cancel edit"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X aria-hidden="true" className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </>
                    ) : category.isSystem ? (
                      <span className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-muted">
                        System
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => beginEdit(category)}
                          aria-label={`Edit ${category.name}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:border-muted"
                        >
                          <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category)}
                          disabled={isBusy}
                          aria-label={`Delete ${category.name}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="Create a category">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-accent">
          <Plus aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">New category</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Add categories that match how you actually organize your projects on disk.
        </p>

        {message ? (
          <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={createCategory}>
          <label className="block text-sm font-semibold text-ink">
            Name
            <input
              required
              maxLength={48}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              placeholder="Reference"
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">Color</legend>
            <div className="flex flex-wrap items-center gap-2">
              {defaultPalette.map((swatch) => {
                const isActive = swatch.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-pressed={isActive}
                    aria-label={`Use color ${swatch}`}
                    className={`grid h-7 w-7 place-items-center rounded-full border-2 transition ${
                      isActive ? "border-ink" : "border-line hover:border-muted"
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                );
              })}
              <input
                aria-label="Custom color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-7 w-9 rounded-md border border-line bg-surface"
              />
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busyAction === "create"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create category
          </button>
        </form>
      </aside>
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
