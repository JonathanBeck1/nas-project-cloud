"use client";

import React, { useState } from "react";
import { HardDrive, KeyRound, Monitor, Smartphone, Terminal, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TrustedDevice, TrustedDeviceKind } from "@/lib/shared/types";

type DevicesWorkspaceProps = {
  devices: TrustedDevice[];
  currentDeviceId: string | null;
};

type PairingResponse = {
  pairingCode?: string;
  expiresAt?: string;
  error?: string;
};

const deviceKindOptions: Array<{ value: TrustedDeviceKind; label: string }> = [
  { value: "browser", label: "Browser" },
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "cli", label: "CLI" }
];

const deviceKindIcons: Record<TrustedDeviceKind, LucideIcon> = {
  browser: Monitor,
  desktop: HardDrive,
  mobile: Smartphone,
  cli: Terminal
};

export function DevicesWorkspace({ devices: initialDevices, currentDeviceId }: DevicesWorkspaceProps) {
  const [devices, setDevices] = useState(initialDevices);
  const [deviceName, setDeviceName] = useState("");
  const [deviceKind, setDeviceKind] = useState<TrustedDeviceKind>("browser");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"pair" | string | null>(null);

  const createPairing = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction("pair");
    setMessage("");
    setError("");
    setPairingCode("");
    setPairingExpiresAt("");

    try {
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, deviceKind })
      });
      const payload = (await safeJson(response)) as PairingResponse;

      if (!response.ok || !payload.pairingCode || !payload.expiresAt) {
        throw new Error(payload.error ?? "Could not create pairing code");
      }

      setPairingCode(payload.pairingCode);
      setPairingExpiresAt(payload.expiresAt);
      setDeviceName("");
      setMessage("Pairing code ready");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create pairing code");
    } finally {
      setBusyAction(null);
    }
  };

  const revokeDevice = async (device: TrustedDevice) => {
    if (!window.confirm(`Revoke ${device.name}? This device will need a new pairing code to reconnect.`)) {
      return;
    }

    setBusyAction(device.id);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(device.id)}`, {
        method: "DELETE"
      });
      const payload = (await safeJson(response)) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not revoke device");
      }

      setDevices((currentDevices) => currentDevices.filter((candidate) => candidate.id !== device.id));
      setMessage(`Revoked ${device.name}`);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke device");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-md border border-line bg-panel shadow-panel" aria-labelledby="trusted-devices-heading">
        <div className="border-b border-line px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Trusted Access</p>
          <h2 id="trusted-devices-heading" className="mt-1 text-base font-semibold text-ink">
            Trusted devices
          </h2>
        </div>

        {devices.length > 0 ? (
          <ul className="divide-y divide-line" aria-label="Trusted devices">
            {devices.map((device) => {
              const Icon = deviceKindIcons[device.kind];
              const isCurrent = device.id === currentDeviceId;
              const isBusy = busyAction === device.id;

              return (
                <li key={device.id} className="flex min-w-0 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{device.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        {labelForKind(device.kind)} | Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "never"}
                      </p>
                    </div>
                  </div>

                  {isCurrent ? (
                    <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">
                      Current device
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revokeDevice(device)}
                      disabled={isBusy}
                      aria-label={`Revoke ${device.name}`}
                      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center">
            <h2 className="text-sm font-semibold text-ink">No trusted devices yet</h2>
            <p className="mt-1 text-sm leading-6 text-muted">Create a pairing code to connect this vault from another device.</p>
          </div>
        )}
      </section>

      <aside className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-label="Pair a device">
        <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-surface text-accent">
          <KeyRound aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-ink">Pair new device</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Create a short-lived code, then enter it from the device you want to trust.</p>

        {message ? (
          <p role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={createPairing}>
          <label className="block text-sm font-semibold text-ink">
            Device name
            <input
              required
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              placeholder="Workshop PC"
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Device kind
            <select
              value={deviceKind}
              onChange={(event) => setDeviceKind(event.target.value as TrustedDeviceKind)}
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
            >
              {deviceKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busyAction === "pair"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            Create pairing code
          </button>
        </form>

        {pairingCode ? (
          <div className="mt-4 rounded-md border border-line bg-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Pairing Code</p>
            <p className="mt-2 select-all font-mono text-2xl font-semibold text-ink">{pairingCode}</p>
            <p className="mt-2 text-xs leading-5 text-muted">Expires {new Date(pairingExpiresAt).toLocaleString()}.</p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function labelForKind(kind: TrustedDeviceKind): string {
  return deviceKindOptions.find((option) => option.value === kind)?.label ?? kind;
}
