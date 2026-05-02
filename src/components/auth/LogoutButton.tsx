"use client";

import React, { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const [isBusy, setIsBusy] = useState(false);

  async function logout() {
    setIsBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={isBusy}
      className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted transition hover:bg-line/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="truncate">Log out</span>
    </button>
  );
}
