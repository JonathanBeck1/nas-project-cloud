"use client";

import React, { useState } from "react";

type AuthFormProps = {
  mode: "setup" | "login";
  endpoint: string;
  onSuccess?: () => void;
};

export function AuthForm({ mode, endpoint, onSuccess }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const isSetup = mode === "setup";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(isSetup ? { name } : {}),
          password,
          deviceName
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Authentication failed");
      }

      onSuccess?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-md border border-line bg-panel p-5 shadow-panel">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">NAS Project Cloud</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{isSetup ? "Create Owner" : "Sign In"}</h1>
      </div>

      <label className="block text-sm font-medium text-ink">
        Email
        <input
          autoComplete="email"
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      {isSetup ? (
        <label className="block text-sm font-medium text-ink">
          Name
          <input
            autoComplete="name"
            className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            name="name"
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
      ) : null}

      <label className="block text-sm font-medium text-ink">
        Password
        <input
          autoComplete={isSetup ? "new-password" : "current-password"}
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          minLength={12}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      <label className="block text-sm font-medium text-ink">
        Device name
        <input
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          name="deviceName"
          onChange={(event) => setDeviceName(event.target.value)}
          placeholder="Mac Studio"
          type="text"
          value={deviceName}
        />
      </label>

      {message ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {message}
        </p>
      ) : null}

      <button
        className="h-10 w-full rounded-md bg-accent px-3 text-sm font-semibold text-white shadow-panel transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isBusy}
        type="submit"
      >
        {isBusy ? "Working..." : isSetup ? "Create owner" : "Sign in"}
      </button>
    </form>
  );
}
