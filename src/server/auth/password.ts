import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing (master spec §127).
 *
 * scrypt from the Node standard library rather than a dependency: it is
 * memory-hard, it is what the platform already ships, and adding a native
 * module to the Docker image for this would be a poor trade.
 *
 * Stored format is self-describing so parameters can be raised later without
 * invalidating existing hashes:
 *
 *   scrypt$N$r$p$<salt-base64>$<hash-base64>
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);

  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH);

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password. Returns false — never throws — for a malformed stored
 * hash, so a corrupt row cannot become an error-message oracle.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, , , , saltB64 = '', hashB64 = ''] = parts;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password, salt, expected.length);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

/**
 * Length over composition rules: staff accounts are few and long passphrases
 * beat mandated symbol classes. The upper bound exists because scrypt cost
 * scales with input and an unbounded field is a denial-of-service vector.
 */
export function assertPasswordPolicy(password: string): void {
  if (password.length < 12) {
    throw new PasswordPolicyError('Password must be at least 12 characters');
  }

  if (password.length > 256) {
    throw new PasswordPolicyError('Password must be at most 256 characters');
  }
}

/** Generates a readable, high-entropy passphrase for provisioning. */
export function generatePassword(bytes = 18): string {
  return randomBytes(bytes).toString('base64url');
}
