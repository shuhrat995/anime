import { query } from '../database/pool.js';
import type { Role } from '../core/types.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  display_name: string;
  avatar_key: string | null;
  token_version: number;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  async create(input: { email: string; passwordHash: string; displayName: string }): Promise<UserRow> {
    const result = await query<UserRow>(
      `INSERT INTO users(email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, password_hash, role, display_name, avatar_key, token_version, is_active, email_verified, created_at, updated_at`,
      [input.email, input.passwordHash, input.displayName],
    );
    return result.rows[0]!;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  async updateProfile(id: string, input: { displayName?: string; avatarKey?: string | null }): Promise<UserRow | null> {
    const result = await query<UserRow>(
      `UPDATE users SET display_name = COALESCE($2, display_name), avatar_key = COALESCE($3, avatar_key)
       WHERE id = $1 RETURNING *`,
      [id, input.displayName ?? null, input.avatarKey ?? null],
    );
    return result.rows[0] ?? null;
  }

  async markEmailVerified(id: string): Promise<UserRow | null> {
    const result = await query<UserRow>(
      'UPDATE users SET email_verified = true WHERE id = $1 RETURNING *',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async incrementTokenVersion(id: string): Promise<number | null> {
    const result = await query<{ token_version: number }>(
      'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
      [id],
    );
    return result.rows[0]?.token_version ?? null;
  }

  async setRole(id: string, role: Role): Promise<UserRow | null> {
    const result = await query<UserRow>('UPDATE users SET role = $2 WHERE id = $1 RETURNING *', [id, role]);
    return result.rows[0] ?? null;
  }
}
