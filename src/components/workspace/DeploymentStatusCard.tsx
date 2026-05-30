"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, ServerCog, TriangleAlert } from "lucide-react";

type PublicHealth = {
  ok: boolean;
  checks: {
    storage: PublicCheck;
    database: PublicCheck;
    previewTools: {
      ffmpeg: PublicToolCheck;
      poppler: PublicToolCheck;
    };
  };
};

type PublicCheck = {
  ok: boolean;
  error?: string;
};

type PublicToolCheck = PublicCheck & {
  version?: string | null;
};

export function DeploymentStatusCard() {
  const [health, setHealth] = useState<PublicHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { method: "GET", cache: "no-store" });
        const json = (await response.json()) as PublicHealth;
        if (!cancelled) {
          setHealth(json);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load deployment status");
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  const ready = health?.ok === true;

  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="deployment-heading">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <ServerCog aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">TrueNAS readiness</p>
          <h2 id="deployment-heading" className="mt-1 text-sm font-semibold text-ink">
            {health ? (ready ? "Deployment ready" : "Deployment needs attention") : "Checking deployment"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Confirms the container can write to storage, query SQLite, and find preview binaries.
          </p>
        </div>
        {health ? (
          ready ? (
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-500" />
          ) : (
            <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-500" />
          )
        ) : null}
      </div>

      {health ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReadinessItem label="Storage mount" check={health.checks.storage} />
          <ReadinessItem label="SQLite database" check={health.checks.database} />
          <ReadinessItem label={toolLabel("ffmpeg", health.checks.previewTools.ffmpeg)} check={health.checks.previewTools.ffmpeg} />
          <ReadinessItem label={toolLabel("pdftoppm", health.checks.previewTools.poppler)} check={health.checks.previewTools.poppler} />
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ReadinessItem({ label, check }: { label: string; check: PublicCheck }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className={check.ok ? "mt-1 text-sm font-semibold text-emerald-600" : "mt-1 text-sm font-semibold text-red-500"}>
        {check.ok ? "Ready" : "Needs attention"}
      </dd>
      {!check.ok && check.error ? <p className="mt-2 break-words text-xs leading-5 text-muted">{check.error}</p> : null}
    </div>
  );
}

function toolLabel(name: string, check: PublicToolCheck): string {
  return check.ok && check.version ? `${name} ${check.version}` : name;
}
