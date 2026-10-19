import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totp, verifyTotp } from "@/lib/server/auth/totp";

// RFC 6238 appendix B, SHA-1 column: the shared secret is the ASCII string "12345678901234567890".
const rfcSecret = Buffer.from("12345678901234567890");

describe("TOTP", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"]
  ])("matches the RFC 6238 test vector at T=%i", (seconds, expected) => {
    expect(totp(rfcSecret, { now: seconds * 1000, digits: 8 })).toBe(expected);
  });

  it("gives six-digit codes by default, as authenticator apps expect", () => {
    expect(totp(rfcSecret, { now: 59_000 })).toBe("287082");
  });

  it("encodes base32 the way RFC 4648 does, without padding", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    expect(base32Decode("mzxw 6ytb oi").toString()).toBe("foobar");
  });

  it("makes 160-bit secrets", () => {
    const secret = generateTotpSecret();

    expect(secret).toHaveLength(20);
    expect(base32Encode(secret)).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret().equals(secret)).toBe(false);
  });

  it("accepts the code for the previous and next 30-second step, but no further", () => {
    const now = 1_700_000_000_000;
    const at = (offsetSteps: number) => totp(rfcSecret, { now: now + offsetSteps * 30_000 });

    expect(verifyTotp(rfcSecret, at(0), { now })).not.toBeNull();
    expect(verifyTotp(rfcSecret, at(-1), { now })).not.toBeNull();
    expect(verifyTotp(rfcSecret, at(1), { now })).not.toBeNull();
    expect(verifyTotp(rfcSecret, at(-2), { now })).toBeNull();
    expect(verifyTotp(rfcSecret, at(2), { now })).toBeNull();
  });

  it("refuses a code from a step that was already used, so a seen code can't be replayed", () => {
    const now = 1_700_000_000_000;
    const code = totp(rfcSecret, { now });
    const step = verifyTotp(rfcSecret, code, { now });

    expect(step).not.toBeNull();
    expect(verifyTotp(rfcSecret, code, { now, lastUsedStep: step! })).toBeNull();
  });

  it("ignores spaces and rejects anything that isn't six digits", () => {
    const now = 1_700_000_000_000;
    const code = totp(rfcSecret, { now });

    expect(verifyTotp(rfcSecret, `${code.slice(0, 3)} ${code.slice(3)}`, { now })).not.toBeNull();
    expect(verifyTotp(rfcSecret, "12345", { now })).toBeNull();
    expect(verifyTotp(rfcSecret, "abcdef", { now })).toBeNull();
  });

  it("builds the otpauth URI authenticator apps scan", () => {
    const uri = otpauthUri(Buffer.from("foobar"), "owner@example.test");

    expect(uri).toBe(
      "otpauth://totp/NAS%20Project%20Cloud:owner%40example.test?secret=MZXW6YTBOI&issuer=NAS%20Project%20Cloud&algorithm=SHA1&digits=6&period=30"
    );
  });
});
