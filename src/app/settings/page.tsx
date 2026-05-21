import React from "react";
import { Settings } from "lucide-react";
import { WorkspaceFrame } from "@/components/workspace/WorkspaceFrame";
import { DeviceLabelEditor } from "@/components/workspace/DeviceLabelEditor";
import { appConfig } from "@/lib/server/config";
import { requirePageSession } from "@/lib/server/pageSession";
import { formatBytes } from "@/components/workspace/FileGrid";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { repo } = await requirePageSession();
  const projects = repo.listProjects();

  const settings = [
    { label: "Storage root", value: appConfig.storageRoot },
    { label: "Database path", value: appConfig.dbPath },
    { label: "Public base path", value: appConfig.publicBasePath },
    { label: "Max upload size", value: formatBytes(appConfig.maxUploadBytes) }
  ];

  return (
    <WorkspaceFrame projects={projects} activeHref="/settings">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="rounded-md border border-line bg-panel px-4 py-4 shadow-panel">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
              <Settings aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">System</p>
              <h1 className="mt-1 text-2xl font-semibold text-ink">Settings</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Runtime configuration for this local NAS cloud instance.
              </p>
            </div>
          </div>
        </section>

        <dl className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {settings.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md border border-line bg-panel px-4 py-3 shadow-panel">
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{item.label}</dt>
              <dd className="mt-2 break-words text-sm font-medium text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>

        <DeviceLabelEditor />
      </div>
    </WorkspaceFrame>
  );
}
