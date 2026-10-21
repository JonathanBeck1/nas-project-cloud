import React from "react";
import { AcceptInvite } from "@/components/auth/AcceptInvite";
import { hashSessionToken } from "@/lib/server/auth/sessions";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export const dynamic = "force-dynamic";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const invite = createMetadataRepository(getDatabase()).getPendingInvite({ tokenHash: hashSessionToken(token) });

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-8 text-ink">
      {invite ? (
        <AcceptInvite token={token} />
      ) : (
        <section className="w-full max-w-md rounded-md border border-line bg-panel p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">NAS Project Cloud</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">This invite can&apos;t be used</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            It has expired, was revoked, or was already used. Ask whoever sent it for a new link.
          </p>
        </section>
      )}
    </main>
  );
}
