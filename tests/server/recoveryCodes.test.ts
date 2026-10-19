import { describe, expect, it } from "vitest";
import { createRecoveryCodes, hashRecoveryCode } from "@/lib/server/auth/recoveryCodes";

describe("recovery codes", () => {
  it("makes ten distinct codes in an easy-to-copy format", () => {
    const codes = createRecoveryCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    }
  });

  it("hashes the same however it's typed, and never stores the code itself", () => {
    const [code] = createRecoveryCodes();

    expect(hashRecoveryCode(code.toLowerCase().replace("-", " "))).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(code)).not.toContain(code.replace("-", ""));
    expect(hashRecoveryCode(code)).toMatch(/^[0-9a-f]{64}$/);
  });
});
