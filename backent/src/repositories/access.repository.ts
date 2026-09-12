import { query } from '../database/pool.js';

export interface AccessGrantRow {
  user_id: string; anime_id: string; granted_by: string | null; expires_at: Date | null; created_at: Date;
  display_name: string; email: string;
}

export class AccessRepository {
  async grant(userId: string, animeId: string, grantedBy: string, expiresAt: Date | null): Promise<void> {
    await query(
      `INSERT INTO anime_access(user_id, anime_id, granted_by, expires_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, anime_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, expires_at = EXCLUDED.expires_at`,
      [userId, animeId, grantedBy, expiresAt],
    );
  }

  async revoke(userId: string, animeId: string): Promise<boolean> {
    const result = await query('DELETE FROM anime_access WHERE user_id = $1 AND anime_id = $2', [userId, animeId]);
    return Boolean(result.rowCount);
  }

  async listForAnime(animeId: string): Promise<AccessGrantRow[]> {
    const result = await query<AccessGrantRow>(
      `SELECT aa.user_id, aa.anime_id, aa.granted_by, aa.expires_at, aa.created_at, u.display_name, u.email
       FROM anime_access aa JOIN users u ON u.id = aa.user_id WHERE aa.anime_id = $1 ORDER BY aa.created_at DESC`,
      [animeId],
    );
    return result.rows;
  }

  async hasAccess(userId: string, animeId: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      `SELECT true AS exists FROM anime_access
       WHERE user_id = $1 AND anime_id = $2 AND (expires_at IS NULL OR expires_at > now())`,
      [userId, animeId],
    );
    return Boolean(result.rowCount);
  }
}

export const accessRepository = new AccessRepository();
