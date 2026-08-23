import { createHash, timingSafeEqual } from 'crypto';

/**
 * Emailed login codes are never stored in clear. The loginId doubles as the
 * per-code salt: it is 128 random bits, unique per row, and the client has to
 * present it together with the code, so a table over the 1,000,000 possible
 * codes buys nothing.
 */
export function hashLoginCode(loginId, code) {
  return createHash('sha256').update(`${loginId}:${code}`).digest('hex');
}

/** Constant-time compare. Never throws: a malformed stored hash is just "no". */
export function codeMatches(loginId, code, storedHex) {
  if (typeof storedHex !== 'string' || storedHex.length !== 64) return false;
  const expected = Buffer.from(hashLoginCode(loginId, code), 'hex');
  const stored = Buffer.from(storedHex, 'hex');
  if (stored.length !== expected.length) return false;
  return timingSafeEqual(expected, stored);
}
