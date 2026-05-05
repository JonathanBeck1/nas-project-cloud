import React from "react";
import { DevicesWorkspace } from "@/components/workspace/DevicesWorkspace";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { repo, userId, deviceId } = await requirePageSession();
  const projects = repo.listProjects();
  const devices = repo.listDevices(userId);

  return (
    <WorkspaceFrame projects={projects} activeHref="/devices">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Trusted Access</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Devices</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Review browsers, desktop clients, phones, and CLI tools that are trusted to use this local cloud.
          </p>
        </section>

        <DevicesWorkspace devices={devices} currentDeviceId={deviceId} />
      </div>
    </WorkspaceFrame>
  );
}
