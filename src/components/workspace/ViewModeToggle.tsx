import React, { useEffect, useState } from "react";
import { Grid2X2, Images, List } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FileGridMode } from "./FileGrid";

const VIEW_MODE_STORAGE_KEY = "nas-cloud:viewMode";

const viewModes: { mode: FileGridMode; label: string; Icon: LucideIcon }[] = [
  { mode: "grid", label: "Grid view", Icon: Grid2X2 },
  { mode: "gallery", label: "Gallery view", Icon: Images },
  { mode: "list", label: "List view", Icon: List }
];

function readStoredViewMode(): FileGridMode {
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return viewModes.find((option) => option.mode === raw)?.mode ?? "grid";
  } catch {
    return "grid";
  }
}

// Shared by every file view so the choice follows the user from page to page.
export function useViewMode(): [FileGridMode, (mode: FileGridMode) => void] {
  const [viewMode, setViewMode] = useState<FileGridMode>("grid");

  useEffect(() => {
    setViewMode(readStoredViewMode());
  }, []);

  const changeViewMode = (mode: FileGridMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage can be unavailable (private mode, quota); the choice then lasts for this page only.
    }
  };

  return [viewMode, changeViewMode];
}

export function ViewModeToggle({ value, onChange }: { value: FileGridMode; onChange: (mode: FileGridMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-panel p-1" role="group" aria-label="View mode">
      {viewModes.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          aria-label={label}
          aria-pressed={value === mode}
          title={label}
          onClick={() => onChange(mode)}
          className={`grid h-9 w-9 place-items-center rounded-md border transition ${
            value === mode
              ? "border-accent bg-accent text-white"
              : "border-line bg-panel text-muted hover:border-muted hover:text-ink"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
