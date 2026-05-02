import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/server/auth/passwords";
import { createSessionToken, hashSessionToken, sessionCookieName } from "@/lib/server/auth/sessions";

describe("password hashing", () => {
  it("hashes and verifies a password without storing the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  it("creates random tokens and stable token hashes", () => {
    const token = createSessionToken();
    const secondToken = createSessionToken();

    expect(token).not.toBe(secondToken);
    expect(token.length).toBeGreaterThan(40);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(secondToken));
    expect(sessionCookieName).toBe("nas_cloud_session");
  });
});
