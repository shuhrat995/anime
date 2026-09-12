import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Verification tokens are stored hashed (sha256) so a database leak cannot be replayed against
 * the verify endpoint, and compared in constant time. The raw token is only ever shown once —
 * in dev it is printed to the server console instead of being emailed.
 */
export const generateVerificationToken = (): { token: string; tokenHash: string } => {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashVerificationToken(token) };
};

export const hashVerificationToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const verificationTokensMatch = (token: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashVerificationToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
