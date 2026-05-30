import React from "react";

type ShareDownloadPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ShareDownloadPage({ params }: ShareDownloadPageProps) {
  const { token } = await params;
  const downloadPath = `/api/shares/${encodeURIComponent(token)}/download`;

  return (
    <main className="min-h-screen bg-surface px-4 py-10 text-ink">
      <section className="mx-auto max-w-md rounded-md border border-line bg-panel p-6 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Shared file</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Download file</h1>
        <form aria-label="Shared file download" className="mt-6 space-y-4" action={downloadPath} method="post">
          <label className="block text-sm font-semibold text-ink">
            Password
            <input
              className="mt-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink"
              name="password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white"
          >
            Download file
          </button>
        </form>
      </section>
    </main>
  );
}
