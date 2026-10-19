"use client";

import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { RecoveryCodeList } from "@/components/auth/RecoveryCodeList";
import { csrfHeaders } from "@/lib/client/csrf";

export function TwoFactorCard({ recoveryCodesLeft }: { recoveryCodesLeft: number }) {
  const [codesLeft, setCodesLeft] = useState(recoveryCodesLeft);
  const [isAsking, setIsAsking] = useState(false);
  const [code, setCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function regenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/two-factor/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ code })
      });
      const body = (await response.json().catch(() => ({}))) as { recoveryCodes?: string[]; error?: string };
      if (!response.ok || !body.recoveryCodes) throw new Error(body.error ?? `status ${response.status}`);
      setNewCodes(body.recoveryCodes);
      setCodesLeft(body.recoveryCodes.length);
      setIsAsking(false);
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : "Could not create new codes");
    } finally {
      setCode("");
      setIsBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-line bg-panel p-4 shadow-panel" aria-labelledby="two-factor-heading">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-surface text-accent">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="two-factor-heading" className="text-sm font-semibold text-ink">
            Two-factor sign-in
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            On. Signing in takes your password and a code from your authenticator app.{" "}
            <span className={codesLeft <= 3 ? "font-semibold text-red-500" : undefined}>
              {codesLeft} of 10 recovery codes left.
            </span>
          </p>
        </div>
        {!isAsking ? (
          <button
            type="button"
            onClick={() => {
              setIsAsking(true);
              setNewCodes(null);
            }}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
          >
            New recovery codes
          </button>
        ) : null}
      </div>

      {isAsking ? (
        <form onSubmit={regenerate} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="block min-w-0 flex-1 basis-48 text-xs font-medium text-ink">
            Code from your authenticator app
            <input
              autoComplete="one-time-code"
              autoFocus
              className="mt-1 h-9 w-full rounded-md border border-line bg-surface px-3 font-mono text-sm tracking-wider outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              pattern="[0-9 ]{6,7}"
              placeholder="123456"
              required
              type="text"
              value={code}
            />
          </label>
          <button
            type="submit"
            disabled={isBusy}
            className="h-9 rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Replace codes
          </button>
          <button
            type="button"
            onClick={() => setIsAsking(false)}
            className="h-9 rounded-md px-3 text-sm font-medium text-muted hover:text-ink"
          >
            Cancel
          </button>
          <p className="w-full text-xs text-muted">Your old recovery codes stop working.</p>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}

      {newCodes ? (
        <div className="mt-4 max-w-md">
          <p role="status" className="mb-2 text-xs font-medium text-accent">
            New codes below. Save them now; they won&apos;t be shown again.
          </p>
          <RecoveryCodeList codes={newCodes} />
        </div>
      ) : null}
    </section>
  );
}
