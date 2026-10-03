import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageSyncCard } from "@/components/workspace/StorageSyncCard";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const missing = [{ id: "file_1", name: "gone.stl", storagePath: "Inbox/Mac/gone.stl" }];

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn<typeof fetch>((input, init) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("StorageSyncCard", () => {
  beforeEach(() => {
    document.cookie = "nas_cloud_csrf=fake-csrf";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.cookie = "nas_cloud_csrf=; max-age=0";
  });

  it("lists files that are missing from disk", async () => {
    stubFetch(() => json({ missingCount: 1, missingFiles: missing }));

    render(<StorageSyncCard />);

    expect(await screen.findByText("gone.stl")).toBeInTheDocument();
    expect(screen.getByText("Inbox/Mac/gone.stl")).toBeInTheDocument();
  });

  it("runs a sync, reports what changed, and refreshes the list", async () => {
    let synced = false;
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        synced = true;
        return json({ scanned: 12, indexed: 1, relinked: 2, restored: 0, missing: 1, deferred: 3 });
      }
      return json(synced ? { missingCount: 1, missingFiles: missing } : { missingCount: 0, missingFiles: [] });
    });

    render(<StorageSyncCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("2 relinked");
    expect(status).toHaveTextContent("1 indexed");
    expect(status).toHaveTextContent("1 missing");
    expect(status).toHaveTextContent("3 deferred");
    expect(await screen.findByText("gone.stl")).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/maintenance/reindex");
    expect(new Headers(post[1]?.headers).get("x-nas-csrf")).toBe("fake-csrf");
  });

  it("shows the server's reason when the storage root is unavailable", async () => {
    stubFetch((url, init) =>
      init?.method === "POST"
        ? json({ error: "Storage root is empty or unavailable" }, 503)
        : json({ missingCount: 0, missingFiles: [] })
    );

    render(<StorageSyncCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Storage root is empty or unavailable");
  });

  it("says so when a sync is already running in the background", async () => {
    stubFetch((url, init) =>
      init?.method === "POST" ? json({ running: true }, 202) : json({ missingCount: 0, missingFiles: [] })
    );

    render(<StorageSyncCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByRole("status")).toHaveTextContent("already running");
  });

  it("loads the missing list from the reindex endpoint", async () => {
    const fetchMock = stubFetch(() => json({ missingCount: 0, missingFiles: [] }));

    render(<StorageSyncCard />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/maintenance/reindex");
  });

  it("removes a missing file's record after confirmation", async () => {
    let removed = false;
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === "DELETE") {
        removed = true;
        return json({ ok: true });
      }
      return json(removed ? { missingCount: 0, missingFiles: [] } : { missingCount: 1, missingFiles: missing });
    });

    render(<StorageSyncCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove record for gone.stl" }));

    await waitFor(() => expect(screen.queryByText("gone.stl")).not.toBeInTheDocument());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("tags and share links"));
    expect(fetchMock.mock.calls.some(([input, init]) => init?.method === "DELETE" && String(input) === "/api/files/file_1/delete")).toBe(true);
  });
});
