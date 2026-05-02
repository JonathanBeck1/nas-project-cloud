import React from "react";
import { Archive, X } from "lucide-react";

type BulkActionBarProps = {
  selectedCount: number;
  onArchive: () => void;
  onClearSelection: () => void;
};

export function BulkActionBar({ selectedCount, onArchive, onClearSelection }: BulkActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 py-2 shadow-panel">
      <span className="text-sm font-semibold text-ink">{selectedCount} selected</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onArchive}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted"
        >
          <Archive aria-hidden="true" className="h-4 w-4" />
          Archive
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-muted"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          Clear selection
        </button>
      </div>
    </div>
  );
}
