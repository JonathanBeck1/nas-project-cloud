import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword, needsRehash, SHARE_PASSWORD_PARAMS, verifyPassword } from "@/lib/server/auth/passwords";

const FAST = { N: 1024, r: 8, p: 1 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("password hashing parameters", () => {
  it("hashes accounts at N=2^17 and records the parameters in the hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^scrypt:131072:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("still verifies a legacy three-part hash and flags it for rehashing", async () => {
    const salt = "00112233445566778899aabbccddeeff";
    const legacy = `scrypt:${salt}:${crypto.scryptSync("old password", salt, 64).toString("hex")}`;

    await expect(verifyPassword("old password", legacy)).resolves.toBe(true);
    await expect(verifyPassword("wrong", legacy)).resolves.toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("uses a cheaper cost for share-link passwords", async () => {
    const hash = await hashPassword("share secret", SHARE_PASSWORD_PARAMS);

    expect(hash.startsWith(`scrypt:${SHARE_PASSWORD_PARAMS.N}:8:1:`)).toBe(true);
    expect(SHARE_PASSWORD_PARAMS.N).toBeLessThan(131072);
    await expect(verifyPassword("share secret", hash)).resolves.toBe(true);
  });

  it("rejects malformed or absurd hashes without throwing", async () => {
    for (const stored of ["not-a-real-hash", "scrypt:abc:8:1:aa:bb", "scrypt:3:8:1:aa:bb", "bcrypt:1:2:3:aa:bb"]) {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    }
  });

  it("runs at most two derivations at a time", async () => {
    let running = 0;
    let peak = 0;
    vi.spyOn(crypto, "scrypt").mockImplementation(((...args: unknown[]) => {
      running += 1;
      peak = Math.max(peak, running);
      const callback = args[args.length - 1] as (error: Error | null, key: Buffer) => void;
      setTimeout(() => {
        running -= 1;
        callback(null, Buffer.alloc(64));
      }, 5);
    }) as typeof crypto.scrypt);

    await Promise.all(Array.from({ length: 6 }, () => hashPassword("x", FAST)));

    expect(peak).toBe(2);
  });
});
