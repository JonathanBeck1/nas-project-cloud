import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewStatusCard } from "@/components/workspace/PreviewStatusCard";

function statusResponse(overrides: Partial<{ pending: number; ready: number; failed: number; skipped: number; lastReadyAt: string | null }> = {}) {
  return new Response(
    JSON.stringify({
      counts: {
        pending: overrides.pending ?? 0,
        ready: overrides.ready ?? 0,
        failed: overrides.failed ?? 0,
        skipped: overrides.skipped ?? 0
      },
      lastReadyAt: overrides.lastReadyAt ?? null
    }),
    { status: 200 }
  );
}

describe("PreviewStatusCard", () => {
  beforeEach(() => {
    document.cookie = "nas_cloud_csrf=fake-csrf";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "nas_cloud_csrf=; max-age=0";
  });

  it("renders counts and last successful preview timestamp from the status endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        statusResponse({
          pending: 4,
          ready: 12,
          failed: 1,
          skipped: 7,
          lastReadyAt: "2026-05-20T12:34:56.000Z"
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewStatusCard />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/previews/status",
        expect.objectContaining({ method: "GET" })
      );
    });

    expect(await screen.findByText("12")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    expect(screen.getByText(/Last successful preview/)).toBeVisible();
  });

  it("disables the reprocess button when there are no failed previews", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(statusResponse({ ready: 5 })))
    );

    render(<PreviewStatusCard />);

    const button = await screen.findByRole("button", { name: /reprocess failed/i });
    expect(button).toBeDisabled();
  });

  it("requeues failed previews and refreshes the status when the user clicks reprocess", async () => {
    const user = userEvent.setup();
    let statusCallCount = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/maintenance/previews/status") {
        statusCallCount += 1;
        if (statusCallCount === 1) {
          return Promise.resolve(statusResponse({ pending: 0, ready: 0, failed: 3, skipped: 0 }));
        }
        return Promise.resolve(statusResponse({ pending: 3, ready: 0, failed: 0, skipped: 0 }));
      }
      if (url === "/api/maintenance/previews" && init?.method === "POST") {
        const headers = init.headers as Record<string, string>;
        expect(headers["x-nas-csrf"]).toBe("fake-csrf");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: { scanned: 3, processed: 3, failed: 0 },
              resetCount: 3
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ error: "unexpected" }), { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewStatusCard />);

    const button = await screen.findByRole("button", { name: /reprocess failed/i });
    await waitFor(() => expect(button).not.toBeDisabled());

    await user.click(button);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Requeued 3, processed 3, 0 still failed"
    );
  });
});
