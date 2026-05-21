"use client";

import React, { useMemo, useState } from "react";
import { Hash, Plus, Trash2 } from "lucide-react";
import { csrfHeaders } from "@/lib/client/csrf";
import type { Tag } from "@/lib/shared/types";

type TagUsage = {
  tagId: string;
  fileCount: number;
};

type TagManagerProps = {
  tags: Tag[];
  usage: TagUsage[];
};

export function TagManager({ tags: initialTags, usage }: TagManagerProps) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState("");
  const [busyAction, setBusyAction] = useState<"create" | string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const usageById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of usage) {
      map.set(entry.tagId, entry.fileCount);
    }
    return map;
  }, [usage]);

  const createTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setBusyAction("create");
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ name: trimmed })
      });
      const payload = (await safeJson(response)) as { tag?: Tag; error?: string };

      if (!response.ok || !payload.tag) {
        throw new Error(payload.error ?? "Could not create tag");
      }

      setTags((current) => [...current, payload.tag!].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setMessage(`Created ${payload.tag.name}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create tag");
    } finally {
      setBusyAction(null);
    }
  };

  const deleteTag = async (tag: Tag) => {
    const inUseCount = usageById.get(tag.id) ?? 0;
    const confirmation = inUseCount > 0
      ? `Delete the "${tag.name}" tag? It will be removed from ${inUseCount} ${inUseCount === 1 ? "file" : "files"}.`
      : `Delete the "${tag.name}" tag?`;

    if (!window.confirm(confirmation)) {
      return;
    }

    setBusyAction(tag.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/tags/${encodeURIComponent(tag.id)}`, {
        method: "DELETE",
        headers: { ...csrfHeaders() }
      });
      const payload = (await safeJson(response)) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not delete tag");
      }

      setTags((current) => current.filter((candidate) => candidate.id !== tag.id));
      setMessage(`Deleted ${tag.name}`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete tag");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-md border border-line bg-panel shadow-panel" aria-labelledby="tag-list-heading">
        <div className="border-b border-line px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Organization</p>
          <h2 id="tag-list-heading" className="mt-1 text-base font-semibold text-ink">
            Tags
          </h2>
        </div>

        {tags.length > 0 ? (
          <ul className="divide-y divide-line" aria-label="Tags">
            {tags.map((tag) => {
              const fileCount = usageById.get(tag.id) ?? 0;
              const isBusy = busyAction === tag.id;
              return (
                <li
                  key={tag.id}
                  className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
                      <Hash aria-hidden="true" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{tag.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {fileCount} {fileCount === 1 ? "file" : "files"} | slug {tag.slug}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteTag(tag)}
                    disabled={isBusy}
                    aria-label={`Delete tag ${tag.name}`}
                    className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center">
            <h3 className="text-sm font-semibold text-ink">No tags yet</h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              Create tags to mark files across projects and categories.
            </p>
          </div>
        )}
      </section>

      <aside className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="Create a tag">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-accent">
          <Plus aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">New tag</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Tags are global. They show up on file detail panels and surface in search filters.
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

        <form className="mt-4 space-y-3" onSubmit={createTag}>
          <label className="block text-sm font-semibold text-ink">
            Tag name
            <input
              required
              maxLength={48}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              placeholder="reference"
            />
          </label>
          <button
            type="submit"
            disabled={busyAction === "create"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create tag
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
