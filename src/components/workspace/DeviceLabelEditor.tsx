"use client";

import React, { useEffect, useState } from "react";
import { detectDeviceLabel, readStoredDeviceLabel, writeStoredDeviceLabel } from "@/lib/client/sourceDevice";

export function DeviceLabelEditor() {
  const [stored, setStored] = useState<string | null>(null);
  const [detected, setDetected] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const saved = readStoredDeviceLabel();
    setStored(saved);
    setDraft(saved ?? "");
    setDetected(detectDeviceLabel(typeof navigator !== "undefined" ? navigator.userAgent : null));
  }, []);

  const effectiveLabel = stored ?? detected;

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    writeStoredDeviceLabel(trimmed);
    if (trimmed.length === 0) {
      setStored(null);
      setStatusMessage(`Reset to detected label: ${detected}`);
    } else {
      setStored(trimmed);
      setStatusMessage(`Saved label: ${trimmed}`);
    }
  };

  const handleReset = () => {
    writeStoredDeviceLabel("");
    setStored(null);
    setDraft("");
    setStatusMessage(`Reset to detected label: ${detected}`);
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-md border border-line bg-panel p-4 shadow-panel"
      aria-labelledby="device-label-heading"
    >
      <div className="flex flex-col gap-2">
        <h2 id="device-label-heading" className="text-sm font-semibold text-ink">
          This device label
        </h2>
        <p className="text-xs leading-5 text-muted">
          Tags every file uploaded from this browser with the label below. Defaults to the value detected from your
          browser&apos;s user-agent.
        </p>
        <p className="text-xs text-muted">
          Currently using <span className="font-semibold text-ink">{effectiveLabel}</span>
          {stored ? <span> (custom)</span> : <span> (auto-detected)</span>}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="device-label-input" className="sr-only">
          Device label
        </label>
        <input
          id="device-label-input"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setStatusMessage("");
          }}
          placeholder={detected || "e.g. Studio Mac"}
          maxLength={64}
          className="h-10 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90"
          >
            Save label
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
          >
            Use detected
          </button>
        </div>
      </div>

      {statusMessage ? (
        <p role="status" className="mt-3 text-xs font-medium text-accent">
          {statusMessage}
        </p>
      ) : null}
    </form>
  );
}
