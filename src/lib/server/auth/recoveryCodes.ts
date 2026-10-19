import crypto from "node:crypto";
import { customAlphabet } from "nanoid";

// Same unambiguous alphabet as the setup code; 31^10 is about 50 bits each, so a fast hash is enough.
const createCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 10);

export function createRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const code = createCode();
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

export function hashRecoveryCode(input: string): string {
  return crypto.createHash("sha256").update(input.toUpperCase().replace(/[^0-9A-Z]/g, "")).digest("hex");
}
