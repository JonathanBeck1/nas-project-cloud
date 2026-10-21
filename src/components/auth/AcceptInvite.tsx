"use client";

import React from "react";
import { AuthForm } from "./AuthForm";

export function AcceptInvite({ token }: { token: string }) {
  return (
    <AuthForm
      endpoint="/api/invites/accept"
      inviteToken={token}
      mode="invite"
      onSuccess={() => {
        window.location.href = "/two-factor";
      }}
    />
  );
}
