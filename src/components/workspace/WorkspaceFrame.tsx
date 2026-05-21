import React from "react";
import { MobileNavTrigger } from "./MobileNavTrigger";
import { Sidebar } from "./Sidebar";
import type { Project } from "@/lib/shared/types";

type WorkspaceFrameProps = {
  projects: Project[];
  activeHref: string;
  children: React.ReactNode;
};

export function WorkspaceFrame({ projects, activeHref, children }: WorkspaceFrameProps) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden min-h-0 md:block">
          <Sidebar projects={projects} activeHref={activeHref} />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
            <MobileNavTrigger projects={projects} activeHref={activeHref} />
            <p className="truncate text-sm font-semibold text-ink">NAS Project Cloud</p>
          </div>
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 lg:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
