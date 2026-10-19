import React from "react";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { TwoFactorEnrollment } from "@/components/auth/TwoFactorEnrollment";
import { requirePageSession } from "@/lib/server/pageSession";

export const dynamic = "force-dynamic";

export default async function TwoFactorPage() {
  const { repo, userId } = await requirePageSession({ allowWithoutTwoFactor: true });
  if (repo.getTwoFactorState(userId)?.enabled) {
    redirect("/settings");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-8 text-ink">
      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <TwoFactorEnrollment />
        <LogoutButton />
      </div>
    </main>
  );
}
