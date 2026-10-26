import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditLogWorkspace } from "@/components/workspace/AuditLogWorkspace";
import type { AuditEvent } from "@/lib/shared/types";

const entry = (overrides: Partial<AuditEvent>): AuditEvent => ({
  id: "audit_1",
  createdAt: "2026-10-20T15:00:00.000Z",
  userId: "user_owner",
  userEmail: "owner@example.test",
  action: "file_uploaded",
  targetType: "file",
  targetId: "file_1",
  targetLabel: "contract.pdf",
  ip: null,
  detail: null,
  ...overrides
});

const people = [{ id: "user_member", name: "Morgan", email: "morgan@example.test" }];

describe("AuditLogWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists entries with who did what to which target", () => {
    render(
      <AuditLogWorkspace
        initial={{
          events: [
            entry({}),
            entry({ id: "audit_2", action: "sign_in_failed", userId: null, userEmail: null, targetLabel: null, detail: { reason: "no such account" } }),
            entry({ id: "audit_3", action: "audit_exported", targetLabel: null, detail: {} })
          ],
          nextCursor: null
        }}
        people={people}
      />
    );

    const items = within(screen.getByRole("list", { name: "Audit entries" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("File uploaded · contract.pdf");
    expect(items[0]).toHaveTextContent("owner@example.test");
    expect(items[1]).toHaveTextContent("Failed sign-in");
    expect(items[1]).toHaveTextContent("no signed-in person · reason: no such account");
    expect(items[2].querySelectorAll("p")[1].textContent).toBe("owner@example.test");
  });

  it("reloads for a filter, points the export at the same filter, and loads more on request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      const events = url.includes("cursor=") ? [entry({ id: "audit_older", targetLabel: "older.pdf" })] : [entry({ id: "audit_morgan", targetLabel: "morgan.pdf" })];
      return Promise.resolve(new Response(JSON.stringify({ events, nextCursor: url.includes("cursor=") ? null : "c1" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditLogWorkspace initial={{ events: [entry({})], nextCursor: null }} people={people} />);

    await user.selectOptions(screen.getByLabelText("Person"), "user_member");
    await user.selectOptions(screen.getByLabelText("Action"), "file_uploaded");

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith("/api/audit?userId=user_member&action=file_uploaded"));
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/api/audit/export?userId=user_member&action=file_uploaded"
    );
    expect(await screen.findByText(/morgan\.pdf/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/audit?userId=user_member&action=file_uploaded&cursor=c1");
    expect(await screen.findByText(/older\.pdf/)).toBeVisible();
    expect(screen.getByText(/morgan\.pdf/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows the answer for the latest filters even when an earlier request answers last", async () => {
    const user = userEvent.setup();
    let releaseFirst: () => void = () => undefined;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      const body = (label: string) => new Response(JSON.stringify({ events: [entry({ id: label, targetLabel: label })], nextCursor: null }));
      if (url.includes("action=")) return Promise.resolve(body("latest.pdf"));
      return new Promise((resolve) => {
        releaseFirst = () => resolve(body("stale.pdf"));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuditLogWorkspace initial={{ events: [], nextCursor: null }} people={people} />);

    await user.selectOptions(screen.getByLabelText("Person"), "user_member");
    await user.selectOptions(screen.getByLabelText("Action"), "file_deleted");
    expect(await screen.findByText(/latest\.pdf/)).toBeVisible();
    releaseFirst();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/stale\.pdf/)).not.toBeInTheDocument();
    expect(screen.getByText(/latest\.pdf/)).toBeVisible();
  });
});
