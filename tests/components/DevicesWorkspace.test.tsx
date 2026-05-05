import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevicesWorkspace } from "@/components/workspace/DevicesWorkspace";
import type { TrustedDevice } from "@/lib/shared/types";

const currentDevice: TrustedDevice = {
  id: "device_current",
  userId: "user_1",
  name: "Mac Studio",
  kind: "browser",
  createdAt: "2026-05-01T12:00:00.000Z",
  lastSeenAt: "2026-05-01T12:30:00.000Z"
};

const windowsDevice: TrustedDevice = {
  id: "device_windows",
  userId: "user_1",
  name: "Windows PC",
  kind: "desktop",
  createdAt: "2026-05-01T13:00:00.000Z",
  lastSeenAt: null
};

describe("DevicesWorkspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a pairing code for a new device", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pairingCode: "ABC-123", expiresAt: "2026-05-01T13:15:00.000Z" }), {
          status: 201
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DevicesWorkspace devices={[currentDevice]} currentDeviceId="device_current" />);

    await user.type(screen.getByLabelText("Device name"), "MacBook Air");
    await user.selectOptions(screen.getByLabelText("Device kind"), "desktop");
    await user.click(screen.getByRole("button", { name: "Create pairing code" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/devices",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceName: "MacBook Air", deviceKind: "desktop" })
        })
      )
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Pairing code ready");
    expect(screen.getByText("ABC-123")).toBeVisible();
  });

  it("revokes another trusted device and keeps the current device protected", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DevicesWorkspace devices={[currentDevice, windowsDevice]} currentDeviceId="device_current" />);

    expect(screen.getByText("Current device")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Revoke Mac Studio" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke Windows PC" }));

    expect(confirmSpy).toHaveBeenCalledWith("Revoke Windows PC? This device will need a new pairing code to reconnect.");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/devices/device_windows", {
        method: "DELETE"
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Revoked Windows PC");
    expect(screen.queryByText("Windows PC")).not.toBeInTheDocument();
  });
});
