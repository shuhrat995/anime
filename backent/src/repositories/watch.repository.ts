import { query } from '../database/pool.js';

export class WatchRepository {
  async addFavorite(userId: string, animeId: string): Promise<void> {
    await query('INSERT INTO favorites(user_id, anime_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, animeId]);
  }

  async removeFavorite(userId: string, animeId: string): Promise<void> {
    await query('DELETE FROM favorites WHERE user_id = $1 AND anime_id = $2', [userId, animeId]);
  }

  async listFavorites(userId: string) {
    const result = await query<{ id: string; title: string; slug: string; cover_key: string | null; added_at: Date }>(
      `SELECT a.id, a.title, a.slug, a.cover_key, f.created_at AS added_at FROM favorites f
       JOIN anime a ON a.id = f.anime_id WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async updateProgress(userId: string, episodeId: string, positionSeconds: number, completed: boolean) {
    const result = await query<{ episode_id: string; position_seconds: number; completed_at: Date | null; updated_at: Date }>(
      `INSERT INTO watch_history(user_id, episode_id, position_seconds, completed_at)
       VALUES($1, $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
       ON CONFLICT(user_id, episode_id) DO UPDATE SET
         position_seconds = EXCLUDED.position_seconds,
         completed_at = CASE WHEN $4 THEN now() ELSE watch_history.completed_at END,
         updated_at = now()
       RETURNING episode_id, position_seconds, completed_at, updated_at`,
      [userId, episodeId, positionSeconds, completed],
    );
    return result.rows[0]!;
  }

  async listHistory(userId: string) {
    const result = await query<{
      episode_id: string; position_seconds: number; completed_at: Date | null; updated_at: Date;
      episode_number: number; episode_title: string; anime_id: string; anime_title: string; anime_slug: string;
    }>(
      `SELECT h.episode_id, h.position_seconds, h.completed_at, h.updated_at, e.number AS episode_number,
              e.title AS episode_title, a.id AS anime_id, a.title AS anime_title, a.slug AS anime_slug
       FROM watch_history h JOIN episodes e ON e.id = h.episode_id JOIN anime a ON a.id = e.anime_id
       WHERE h.user_id = $1 ORDER BY h.updated_at DESC`,
      [userId],
    );
    return result.rows;
  }
}
