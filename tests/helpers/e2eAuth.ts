import Database from "better-sqlite3";
import { base32Decode, totp } from "../../src/lib/server/auth/totp";

export const e2eOwner = {
  email: "owner@example.local",
  name: "Owner",
  password: process.env.E2E_OWNER_PASSWORD ?? "local-e2e-password-0000",
  deviceName: "Playwright"
};

// Written by owner.setup.ts after enrolling two-factor; every spec starts signed in from it.
export const ownerStatePath = ".data/e2e/owner-state.json";

const STEP_MS = 30_000;

// A code from a step the server hasn't accepted yet, since replay protection refuses those.
export async function unusedTotpCode(email = e2eOwner.email, dbPath = ".data/e2e/nas-cloud.sqlite"): Promise<string> {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = (() => {
    try {
      return db.prepare("select totp_secret as secret, totp_last_step as lastStep from users where email = ?").get(email) as
        | { secret: string; lastStep: number }
        | undefined;
    } finally {
      db.close();
    }
  })();
  if (!row?.secret) throw new Error(`${email} has no two-factor secret`);

  for (;;) {
    const current = Math.floor(Date.now() / STEP_MS);
    const step = Math.max(current, row.lastStep + 1);
    if (step <= current + 1) return totp(base32Decode(row.secret), { now: step * STEP_MS });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
