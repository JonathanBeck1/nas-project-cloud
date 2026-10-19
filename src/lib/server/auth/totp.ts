import crypto from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const ISSUER = "NAS Project Cloud";

export function generateTotpSecret(): Buffer {
  return crypto.randomBytes(20);
}

// RFC 6238 over HMAC-SHA1, the variant every authenticator app supports.
export function totp(secret: Buffer, { now = Date.now(), digits = 6 }: { now?: number; digits?: number } = {}): string {
  return codeForStep(secret, Math.floor(now / 1000 / STEP_SECONDS), digits);
}

// Returns the step the code matched, so the caller can refuse it next time, or null.
export function verifyTotp(
  secret: Buffer,
  input: string,
  { now = Date.now(), lastUsedStep = -1 }: { now?: number; lastUsedStep?: number } = {}
): number | null {
  const code = input.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  // One step either side covers a phone clock that's a little off.
  for (const step of [current - 1, current, current + 1]) {
    if (step > lastUsedStep && crypto.timingSafeEqual(Buffer.from(codeForStep(secret, step, 6)), Buffer.from(code))) {
      return step;
    }
  }
  return null;
}

export function otpauthUri(secret: Buffer, account: string): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error("not base32");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codeForStep(secret: Buffer, step: number, digits: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}
