import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Info, X } from "lucide-react";
import type { CloudFile, FileShareLink, Project, Tag } from "@/lib/shared/types";
import { formatBytes } from "./FileGrid";

type DetailDrawerProps = {
  file: CloudFile | null;
  projects?: Project[];
  availableTags?: Tag[];
  isBusy?: boolean;
  onArchive?: (file: CloudFile) => void;
  onRename?: (file: CloudFile, name: string) => void;
  onAssignProject?: (file: CloudFile, projectId: string) => void;
  onAssignTags?: (file: CloudFile, tagIds: string[]) => void;
  onCreateShareLink?: (
    file: CloudFile,
    options: CreateShareLinkOptions
  ) => Promise<CreateShareLinkResult> | CreateShareLinkResult;
  onListShareLinks?: (file: CloudFile) => Promise<FileShareLink[]>;
  onRevokeShareLink?: (file: CloudFile, share: FileShareLink) => Promise<FileShareLink>;
};

export type CreateShareLinkOptions = {
  expiresInHours: number;
  maxDownloads: number | null;
  label: string | null;
};

type CreateShareLinkResult = {
  share: FileShareLink;
  url: string;
};

export function DetailDrawer({
  file,
  projects = [],
  availableTags = [],
  isBusy = false,
  onArchive,
  onRename,
  onAssignProject,
  onAssignTags,
  onCreateShareLink,
  onListShareLinks,
  onRevokeShareLink
}: DetailDrawerProps) {
  const [draftName, setDraftName] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareLinks, setShareLinks] = useState<FileShareLink[]>([]);
  const [shareLabel, setShareLabel] = useState("");
  const [shareExpiresInHours, setShareExpiresInHours] = useState("24");
  const [shareMaxDownloads, setShareMaxDownloads] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isLoadingShares, setIsLoadingShares] = useState(false);
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);

  useEffect(() => {
    setDraftName(file?.name ?? "");
    setShareUrl("");
    setShareError("");
    setShareLinks([]);
    setShareLabel("");
    setShareExpiresInHours("24");
    setShareMaxDownloads("");
    setRevokingShareId(null);

    if (!file || !onListShareLinks) {
      return;
    }

    let isCurrent = true;
    setIsLoadingShares(true);
    void onListShareLinks(file)
      .then((links) => {
        if (isCurrent) {
          setShareLinks(activeShareLinks(links));
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setShareError(error instanceof Error ? error.message : "Could not load share links");
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingShares(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [file, file?.id, file?.name, onListShareLinks]);

  if (!file) {
    return (
      <aside className="h-full rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="File details">
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-muted">
            <Info aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-sm font-semibold text-ink">File details</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Select a file to inspect its project metadata.</p>
        </div>
      </aside>
    );
  }

  const previewUrl = readyPreviewUrl(file);
  const trimmedDraftName = draftName.trim();
  const canRename = Boolean(onRename) && trimmedDraftName.length > 0 && trimmedDraftName !== file.name;

  return (
    <aside className="h-full rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="File details">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Selected File</p>
        <h2 className="mt-2 truncate text-base font-semibold text-ink">{file.name}</h2>
      </div>

      {previewUrl ? (
        <Image
          unoptimized
          src={previewUrl}
          alt={`Preview of ${file.name}`}
          width={640}
          height={360}
          className="mt-4 aspect-video w-full rounded-md border border-line bg-surface object-contain"
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-white"
          href={`/api/files/${encodeURIComponent(file.id)}/download`}
        >
          Download
        </a>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => onArchive?.(file)}
          disabled={isBusy}
        >
          Archive
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink"
          onClick={() => copyPath(file.storagePath)}
        >
          Copy path
        </button>
      </div>

      {onCreateShareLink ? (
        <div className="mt-4 rounded-md border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-ink">Share</p>
          <label className="mt-3 block text-xs font-semibold text-muted">
            Label
            <input
              className="mt-1 h-9 w-full rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
              value={shareLabel}
              onChange={(event) => setShareLabel(event.target.value)}
              disabled={isBusy || isCreatingShare}
              placeholder="Optional"
            />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">
              Expires
              <select
                className="mt-1 h-9 w-full rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                value={shareExpiresInHours}
                onChange={(event) => setShareExpiresInHours(event.target.value)}
                disabled={isBusy || isCreatingShare}
              >
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
                <option value="720">30 days</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Max downloads
              <input
                className="mt-1 h-9 w-full rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={shareMaxDownloads}
                onChange={(event) => setShareMaxDownloads(event.target.value)}
                disabled={isBusy || isCreatingShare}
                placeholder="Unlimited"
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || isCreatingShare}
            onClick={async () => {
              setIsCreatingShare(true);
              setShareError("");
              try {
                const result = await onCreateShareLink(file, {
                  expiresInHours: Number.parseInt(shareExpiresInHours, 10),
                  maxDownloads: shareMaxDownloads.trim() ? Number.parseInt(shareMaxDownloads, 10) : null,
                  label: shareLabel.trim() || null
                });
                setShareUrl(result.url);
                setShareLinks((current) => [result.share, ...current.filter((share) => share.id !== result.share.id)]);
              } catch (error) {
                setShareError(error instanceof Error ? error.message : "Could not create share link");
              } finally {
                setIsCreatingShare(false);
              }
            }}
          >
            Create share link
          </button>
          {shareUrl ? (
            <label className="mt-3 block text-sm font-semibold text-ink">
              Share link
              <input
                readOnly
                className="mt-2 h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink"
                value={shareUrl}
              />
            </label>
          ) : null}
          {isLoadingShares ? <p className="mt-3 text-xs text-muted">Loading share links...</p> : null}
          {shareLinks.length > 0 ? (
            <div className="mt-3 space-y-2" aria-label="Existing share links">
              {shareLinks.map((share) => (
                <div key={share.id} className="rounded-md border border-line bg-panel px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink">
                        {share.downloadCount} {share.downloadCount === 1 ? "download" : "downloads"}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        Expires {share.expiresAt ? new Date(share.expiresAt).toLocaleString() : "never"}
                      </p>
                    </div>
                    {onRevokeShareLink ? (
                      <button
                        type="button"
                        aria-label="Revoke share link"
                        disabled={isBusy || revokingShareId === share.id}
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={async () => {
                          setRevokingShareId(share.id);
                          setShareError("");
                          try {
                            await onRevokeShareLink(file, share);
                            setShareLinks((current) => current.filter((candidate) => candidate.id !== share.id));
                          } catch (error) {
                            setShareError(error instanceof Error ? error.message : "Could not revoke share link");
                          } finally {
                            setRevokingShareId(null);
                          }
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {shareError ? <p className="mt-2 text-sm font-medium text-red-700">{shareError}</p> : null}
        </div>
      ) : null}

      {onRename ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRename) {
              return;
            }
            onRename(file, trimmedDraftName);
          }}
        >
          <label className="block text-sm font-semibold text-ink">
            File name
            <input
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              disabled={isBusy}
            />
          </label>
          <button
            type="submit"
            className="mt-2 inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || !canRename}
          >
            Rename
          </button>
        </form>
      ) : null}

      <label className="mt-4 block text-sm font-semibold text-ink">
        Project
        <select
          className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
          value={file.projectId ?? ""}
          onChange={(event) => onAssignProject?.(file, event.target.value)}
          disabled={isBusy}
        >
          <option value="">Inbox</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <TagPicker
        file={file}
        availableTags={availableTags}
        isBusy={isBusy}
        onAssignTags={onAssignTags}
      />

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
        <DetailRow label="Size" value={formatBytes(file.sizeBytes)} />
        <DetailRow label="Source" value={file.sourceDevice} />
        <DetailRow label="Path" value={file.storagePath} wrap />
        <DetailRow label="Family" value={file.family} />
        <DetailRow label="Extension" value={file.extension || "None"} />
        <DetailRow label="Category" value={file.categoryId ?? "Unsorted"} />
        <DetailRow label="Project" value={file.projectId ?? "Inbox"} />
        {file.preview ? <DetailRow label="Preview" value={previewDetailValue(file)} wrap /> : null}
        <DetailRow label="Updated" value={new Date(file.updatedAt).toLocaleDateString()} />
      </dl>
    </aside>
  );
}

function readyPreviewUrl(file: CloudFile): string | null {
  return file.preview?.status === "ready" && file.preview.previewPath ? `/api/files/${encodeURIComponent(file.id)}/preview` : null;
}

function previewDetailValue(file: CloudFile): string {
  if (!file.preview) {
    return "Not queued";
  }
  if (file.preview.status === "failed" && file.preview.error) {
    return `Failed: ${file.preview.error}`;
  }
  return file.preview.status.charAt(0).toUpperCase() + file.preview.status.slice(1);
}

function copyPath(path: string) {
  void navigator.clipboard?.writeText(path).catch(() => undefined);
}

function activeShareLinks(links: FileShareLink[]): FileShareLink[] {
  const now = Date.now();
  return links.filter((link) => {
    if (link.revokedAt) {
      return false;
    }
    if (link.expiresAt && Date.parse(link.expiresAt) <= now) {
      return false;
    }
    if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) {
      return false;
    }
    return true;
  });
}

function DetailRow({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 font-medium text-ink ${wrap ? "break-words" : "truncate"}`}>{value}</dd>
    </div>
  );
}

type TagPickerProps = {
  file: CloudFile;
  availableTags: Tag[];
  isBusy: boolean;
  onAssignTags?: (file: CloudFile, tagIds: string[]) => void;
};

function TagPicker({ file, availableTags, isBusy, onAssignTags }: TagPickerProps) {
  const assignedIds = useMemo(() => new Set((file.tags ?? []).map((tag) => tag.id)), [file.tags]);
  const unassignedTags = availableTags.filter((tag) => !assignedIds.has(tag.id));

  const removeTag = (tagId: string) => {
    if (!onAssignTags) return;
    const next = (file.tags ?? []).filter((tag) => tag.id !== tagId).map((tag) => tag.id);
    onAssignTags(file, next);
  };

  const addTag = (tagId: string) => {
    if (!onAssignTags || !tagId) return;
    if (assignedIds.has(tagId)) return;
    const next = [...(file.tags ?? []).map((tag) => tag.id), tagId];
    onAssignTags(file, next);
  };

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">Tags</p>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Tags for ${file.name}`}>
        {(file.tags ?? []).length === 0 ? (
          <span className="text-xs text-muted">No tags yet.</span>
        ) : null}
        {(file.tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-ink"
          >
            <span className="truncate" title={tag.slug}>
              {tag.name}
            </span>
            {onAssignTags ? (
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                disabled={isBusy}
                aria-label={`Remove tag ${tag.name}`}
                className="grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-line/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {onAssignTags ? (
        <select
          aria-label="Add tag"
          className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60"
          value=""
          onChange={(event) => {
            addTag(event.target.value);
            event.target.value = "";
          }}
          disabled={isBusy || unassignedTags.length === 0}
        >
          <option value="">
            {availableTags.length === 0
              ? "No tags exist yet"
              : unassignedTags.length === 0
                ? "All tags applied"
                : "Add a tag..."}
          </option>
          {unassignedTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
