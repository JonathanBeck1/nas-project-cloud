"use client";

import { AuthForm } from "@/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4 py-8 text-ink">
      <AuthForm mode="login" endpoint="/api/auth/login" onSuccess={() => { window.location.href = "/"; }} />
    </main>
  );
}
