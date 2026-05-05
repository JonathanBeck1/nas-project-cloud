import React from "react";
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
        <div className="min-h-0">
          <Sidebar projects={projects} activeHref={activeHref} />
        </div>
        <main className="min-w-0 overflow-x-hidden px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
