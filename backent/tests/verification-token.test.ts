import { describe, expect, it } from 'vitest';
import {
  generateVerificationToken,
  hashVerificationToken,
  verificationTokensMatch,
} from '../src/utils/verification-token.js';

describe('verification tokens', () => {
  it('generates a 64-char hex token whose hash is deterministic', () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).toBe(hashVerificationToken(token));
  });

  it('matches the right token and rejects wrong ones', () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(verificationTokensMatch(token, tokenHash)).toBe(true);
    expect(verificationTokensMatch(`${token}0`, tokenHash)).toBe(false);
    const other = generateVerificationToken();
    expect(verificationTokensMatch(other.token, tokenHash)).toBe(false);
  });

  it('never reuses the same token twice', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
