import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth/guards";
import { base32Encode, generateTotpSecret, otpauthUri } from "@/lib/server/auth/totp";
import { groupSecret, qrCodeDataUrl } from "@/lib/server/auth/twoFactor";
import { getDatabase } from "@/lib/server/db";
import { createMetadataRepository } from "@/lib/server/metadata";

export async function POST(request: Request) {
  const auth = await requireApiSession(request, { allowWithoutTwoFactor: true });
  if (!auth.ok) {
    return auth.response;
  }

  const repo = createMetadataRepository(getDatabase());
  if (repo.getTwoFactorState(auth.userId)?.enabled) {
    return NextResponse.json({ error: "two-factor is already on" }, { status: 409 });
  }

  // Each call starts over with a new secret; nothing changes until a code from it is confirmed.
  const secret = generateTotpSecret();
  const encoded = base32Encode(secret);
  repo.setPendingTotpSecret(auth.userId, encoded);
  const uri = otpauthUri(secret, repo.getUserById(auth.userId)?.email ?? "");

  return NextResponse.json({ secret: groupSecret(encoded), otpauthUri: uri, qrDataUrl: qrCodeDataUrl(uri) });
}
