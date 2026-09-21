import crypto from "node:crypto";

export type ScryptParams = { N: number; r: number; p: number };

// OWASP's current scrypt minimum. One derivation needs about 128 MiB.
export const ACCOUNT_PASSWORD_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
// Share passwords sit behind the per-share attempt limiter and guard one file, so they cost a quarter of the memory.
export const SHARE_PASSWORD_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };
// Node's defaults, which is what hashes written before the parameters were stored used.
const LEGACY_PARAMS: ScryptParams = { N: 2 ** 14, r: 8, p: 1 };

// Well-formed and never matches: lets login spend a full derivation on an unknown email.
export const DUMMY_PASSWORD_HASH = `scrypt:${ACCOUNT_PASSWORD_PARAMS.N}:8:1:${"0".repeat(32)}:${"0".repeat(128)}`;

const KEY_LENGTH = 64;
const MAX_CONCURRENT_DERIVATIONS = 2;

export async function hashPassword(password: string, params: ScryptParams = ACCOUNT_PASSWORD_PARAMS): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await derive(password, salt, params);
  return `scrypt:${params.N}:${params.r}:${params.p}:${salt}:${derived.toString("hex")}`;
}

export function hashSharePassword(password: string): Promise<string> {
  return hashPassword(password, SHARE_PASSWORD_PARAMS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseHash(storedHash);
  if (!parsed) {
    return false;
  }

  try {
    const derived = await derive(password, parsed.salt, parsed.params);
    const expected = Buffer.from(parsed.hash, "hex");
    return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function needsRehash(storedHash: string, params: ScryptParams = ACCOUNT_PASSWORD_PARAMS): boolean {
  const current = parseHash(storedHash)?.params;
  return !current || current.N !== params.N || current.r !== params.r || current.p !== params.p;
}

function parseHash(storedHash: string): { params: ScryptParams; salt: string; hash: string } | null {
  const parts = storedHash.split(":");
  if (parts[0] !== "scrypt") {
    return null;
  }
  if (parts.length === 3 && parts[1] && parts[2]) {
    return { params: LEGACY_PARAMS, salt: parts[1], hash: parts[2] };
  }
  if (parts.length !== 6 || !parts[4] || !parts[5]) {
    return null;
  }
  const [N, r, p] = parts.slice(1, 4).map(Number);
  return [N, r, p].every((value) => Number.isInteger(value) && value > 0)
    ? { params: { N, r, p }, salt: parts[4], hash: parts[5] }
    : null;
}

let activeDerivations = 0;
const waitingDerivations: Array<() => void> = [];

// Each derivation holds its memory for its whole run, so concurrent logins are queued rather than multiplied.
async function derive(password: string, salt: string, params: ScryptParams): Promise<Buffer> {
  if (activeDerivations >= MAX_CONCURRENT_DERIVATIONS) {
    await new Promise<void>((resolve) => waitingDerivations.push(resolve));
  } else {
    activeDerivations += 1;
  }

  try {
    return await new Promise<Buffer>((resolve, reject) => {
      // Node caps scrypt at 32 MiB unless told otherwise; the work area is 128 * N * r bytes.
      crypto.scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: 256 * params.N * params.r }, (error, key) =>
        error ? reject(error) : resolve(key)
      );
    });
  } finally {
    const next = waitingDerivations.shift();
    if (next) {
      next();
    } else {
      activeDerivations -= 1;
    }
  }
}
