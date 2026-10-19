import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function GET(request: Request) {
  const auth = await requireApiSession(request, { allowWithoutTwoFactor: true });
  if (!auth.ok) {
    return auth.response;
  }

  const state = createMetadataRepository(getDatabase()).getTwoFactorState(auth.userId);
  return NextResponse.json({ enabled: state?.enabled ?? false, recoveryCodesLeft: state?.recoveryCodesLeft ?? 0 });
}
