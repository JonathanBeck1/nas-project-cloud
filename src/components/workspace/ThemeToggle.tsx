"use client";

import React, { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "nas-cloud:theme";

const PREFERENCES: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "system", label: "System theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon }
];

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
  } catch {
    // localStorage unavailable; fall through.
  }
  return "system";
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") {
    return;
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const isDark = preference === "dark" || (preference === "system" && prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readStoredPreference();
    setPreference(initial);
    applyTheme(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (preference !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => {
      media.removeEventListener("change", handler);
    };
  }, [hydrated, preference]);

  const handleSelect = (next: ThemePreference) => {
    setPreference(next);
    applyTheme(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore quota / unavailable storage
      }
    }
  };

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-1 rounded-md border border-line bg-panel p-1"
    >
      {PREFERENCES.map((option) => {
        const Icon = option.icon;
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            title={option.label}
            onClick={() => handleSelect(option.value)}
            className={`grid h-8 w-8 place-items-center rounded-md border transition ${
              isActive
                ? "border-accent bg-accent text-white"
                : "border-transparent text-muted hover:border-line hover:text-ink"
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
