import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle, THEME_STORAGE_KEY } from "@/components/workspace/ThemeToggle";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => true
  } as unknown as MediaQueryList;
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  return media;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to system preference and reflects active button via aria-pressed", async () => {
    render(<ThemeToggle />);

    const systemButton = await screen.findByRole("button", { name: "System theme" });
    expect(systemButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to dark mode and persists the preference", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Dark theme" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Light theme" }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("restores a saved dark preference on mount", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows OS preference when set to system", async () => {
    mockMatchMedia(true);

    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(screen.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "true");
  });
});
