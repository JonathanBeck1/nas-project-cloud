"use client";

import { AuthForm } from "@/components/auth/AuthForm";

export default function SetupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-8 text-ink">
      <AuthForm mode="setup" endpoint="/api/auth/setup" onSuccess={() => { window.location.href = "/"; }} />
    </main>
  );
}
