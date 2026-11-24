// Password hashing for stored user credentials (scrypt with a per-user salt).
// Legacy plaintext values are still accepted so existing records keep working until they are re-hashed.
import crypto from 'crypto';

const PREFIX = 'scrypt$';
const KEY_LENGTH = 64;

export function isHashedPassword(stored: string | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

export function hashPassword(raw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(raw, salt, KEY_LENGTH).toString('hex');
  return `${PREFIX}${salt}$${hash}`;
}

export function verifyPassword(input: string, stored: string): boolean {
  if (isHashedPassword(stored)) {
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(input, salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  // Legacy plaintext comparison (constant time over fixed-length digests)
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}
