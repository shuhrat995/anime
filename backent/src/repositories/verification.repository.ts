import { query } from '../database/pool.js';
import { generateVerificationToken } from '../utils/verification-token.js';

export interface VerificationRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: 'signup' | 'change';
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export const VERIFICATION_TTL_HOURS = 24;

export class VerificationRepository {
  /** Invalidates outstanding tokens for the user, then stores one fresh hashed token. */
  async issue(userId: string, purpose: 'signup' | 'change' = 'signup'): Promise<string> {
    const { token, tokenHash } = generateVerificationToken();
    await query(
      `INSERT INTO email_verifications(user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, now() + interval '${VERIFICATION_TTL_HOURS} hours')`,
      [userId, tokenHash, purpose],
    );
    return token;
  }

  /** Atomically consumes a token: a used or expired one never verifies twice. */
  async consume(token: string): Promise<{ userId: string; purpose: 'signup' | 'change' } | null> {
    const result = await query<VerificationRow>(
      `UPDATE email_verifications
       SET consumed_at = now()
       WHERE token_hash = (SELECT token_hash FROM email_verifications
                           WHERE consumed_at IS NULL AND expires_at > now()
                           ORDER BY created_at DESC LIMIT 1)
         AND consumed_at IS NULL AND expires_at > now()
         AND token_hash = encode(sha256($1::bytea), 'hex')
       RETURNING user_id, purpose`,
      [token],
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, purpose: row.purpose } : null;
  }

  async deleteForUser(userId: string): Promise<void> {
    await query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
  }
}

export const verificationRepository = new VerificationRepository();
