import React from "react";
import { Loader2, Search, Upload } from "lucide-react";
import type { FileGridMode } from "./FileGrid";
import { ViewModeToggle } from "./ViewModeToggle";

type CommandBarProps = {
  query?: string;
  onQueryChange?: (query: string) => void;
  uploadInputId?: string;
  isSearching?: boolean;
  viewMode?: FileGridMode;
  onChangeViewMode?: (mode: FileGridMode) => void;
};

export function CommandBar({
  query = "",
  onQueryChange,
  uploadInputId,
  isSearching = false,
  viewMode = "grid",
  onChangeViewMode
}: CommandBarProps) {
  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
      <div className="relative min-w-0 flex-1 sm:max-w-xl">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label="Search files"
          placeholder="Search files"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          className="h-10 w-full rounded-md border border-line bg-panel py-2 pl-9 pr-9 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        {isSearching ? (
          <Loader2
            role="status"
            aria-label="Searching"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted"
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ViewModeToggle value={viewMode} onChange={(mode) => onChangeViewMode?.(mode)} />
        <button
          type="button"
          onClick={() => {
            if (uploadInputId) {
              document.getElementById(uploadInputId)?.click();
            }
          }}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/25"
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          <span>Upload</span>
        </button>
      </div>
    </header>
  );
}
