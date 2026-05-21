"use client";

import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import type { Project } from "@/lib/shared/types";

type MobileNavTriggerProps = {
  projects: Project[];
  activeHref: string;
};

export function MobileNavTrigger({ projects, activeHref }: MobileNavTriggerProps) {
  const [open, setOpen] = useState(false);

  const handleNavigationClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a")) {
      setOpen(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink shadow-panel transition hover:border-muted md:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35 md:hidden" />
        <Dialog.Content
          aria-label="Workspace navigation"
          className="fixed inset-y-0 left-0 z-50 flex w-[80%] max-w-xs flex-col border-r border-line bg-panel text-ink shadow-panel md:hidden"
        >
          <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
          <Dialog.Description className="sr-only">
            Library, projects, and system links for the workspace.
          </Dialog.Description>
          <div className="absolute right-2 top-2 z-10">
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close navigation"
                className="grid h-8 w-8 place-items-center rounded-md border border-line bg-panel text-muted transition hover:border-muted hover:text-ink"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1" onClick={handleNavigationClick}>
            <Sidebar projects={projects} activeHref={activeHref} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
