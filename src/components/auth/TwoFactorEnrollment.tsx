"use client";

import React, { useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/client/csrf";
import { RecoveryCodeList } from "./RecoveryCodeList";

type Setup = { secret: string; otpauthUri: string; qrDataUrl: string };

export function TwoFactorEnrollment() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Each setup call replaces the pending secret, so a second call would leave a stale QR code on screen.
    if (started.current) return;
    started.current = true;
    fetch("/api/auth/two-factor/setup", { method: "POST", headers: { ...csrfHeaders() } })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as Setup & { error?: string };
        if (!response.ok) throw new Error(body.error ?? `status ${response.status}`);
        setSetup(body);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? `Could not start setup: ${error.message}` : "Could not start setup")
      );
  }, []);

  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/two-factor/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ code })
      });
      const body = (await response.json().catch(() => ({}))) as { recoveryCodes?: string[]; error?: string };
      if (!response.ok || !body.recoveryCodes) throw new Error(body.error ?? `status ${response.status}`);
      setRecoveryCodes(body.recoveryCodes);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn on two-factor");
      setCode("");
    } finally {
      setIsBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <section className="w-full max-w-md space-y-4 rounded-md border border-line bg-panel p-5 shadow-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Two-factor is on</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">Save your recovery codes</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            If you lose your phone, each of these signs you in once. Keep them in a password manager. They won&apos;t
            be shown again. Your other devices have been signed out.
          </p>
        </div>
        <RecoveryCodeList codes={recoveryCodes} />
        <button
          className="h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/25"
          onClick={() => {
            window.location.href = "/";
          }}
          type="button"
        >
          I saved them, continue
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={enable} className="w-full max-w-md space-y-4 rounded-md border border-line bg-panel p-5 shadow-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">NAS Project Cloud</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Set up two-factor</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Every account needs a code from an authenticator app, such as 1Password, Google Authenticator, or Authy. Scan
          the QR code with it, then enter the 6-digit code it shows.
        </p>
      </div>

      {setup ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-line bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL; next/image has nothing to optimize */}
          <img alt="QR code for your authenticator app" className="h-48 w-48 [image-rendering:pixelated]" src={setup.qrDataUrl} />
        </div>
      ) : (
        <div aria-hidden="true" className="h-[13.5rem] animate-pulse rounded-md border border-line bg-surface" />
      )}

      {setup ? (
        <div>
          <p className="text-xs text-muted">Can&apos;t scan it? Enter this key in the app instead:</p>
          <p className="mt-1 select-all break-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm tracking-wider text-ink" data-testid="totp-secret">
            {setup.secret}
          </p>
        </div>
      ) : null}

      <label className="block text-sm font-medium text-ink">
        Authentication code
        <input
          autoComplete="one-time-code"
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 font-mono text-sm tracking-wider outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          inputMode="numeric"
          name="code"
          onChange={(event) => setCode(event.target.value)}
          pattern="[0-9 ]{6,7}"
          placeholder="123456"
          required
          spellCheck={false}
          type="text"
          value={code}
        />
      </label>

      {message ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {message}
        </p>
      ) : null}

      <button
        className="h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isBusy || !setup}
        type="submit"
      >
        {isBusy ? "Checking..." : "Turn on two-factor"}
      </button>
    </form>
  );
}
