import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeploymentStatusCard } from "@/components/workspace/DeploymentStatusCard";

describe("DeploymentStatusCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows healthy storage, database, and preview tool diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              checks: {
                storage: { ok: true },
                database: { ok: true },
                previewTools: {
                  ffmpeg: { ok: true, version: "6.1" },
                  poppler: { ok: true, version: "24.02.0" }
                }
              }
            }),
            { status: 200 }
          )
        )
      )
    );

    render(<DeploymentStatusCard />);

    await waitFor(() => {
      expect(screen.getByText("Storage mount")).toBeVisible();
    });
    expect(screen.getByText("Deployment ready")).toBeVisible();
    expect(screen.getByText("ffmpeg 6.1")).toBeVisible();
    expect(screen.getByText("pdftoppm 24.02.0")).toBeVisible();
  });

  it("surfaces failing deployment checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ok: false,
              checks: {
                storage: { ok: false, error: "EACCES: permission denied" },
                database: { ok: true },
                previewTools: {
                  ffmpeg: { ok: true, version: "6.1" },
                  poppler: { ok: false, error: "spawn pdftoppm ENOENT" }
                }
              }
            }),
            { status: 503 }
          )
        )
      )
    );

    render(<DeploymentStatusCard />);

    expect(await screen.findByText("Deployment needs attention")).toBeVisible();
    expect(screen.getByText("EACCES: permission denied")).toBeVisible();
    expect(screen.getByText("spawn pdftoppm ENOENT")).toBeVisible();
  });
});
