import { customAlphabet } from "nanoid";

// Read off a log and typed by hand, so no 0/O or 1/I/L. 31^12 is about 59 bits.
export const createSetupCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 12);

export function normalizeSetupCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function formatSetupCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}
