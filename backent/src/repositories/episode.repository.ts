import { query, withTransaction } from '../database/pool.js';

export interface EpisodeRow {
  id: string; anime_id: string; number: number; title: string; description: string;
  status: 'draft' | 'published' | 'processing' | 'failed'; package_prefix: string | null;
  manifest: Record<string, unknown> | null; metadata: Record<string, unknown> | null; duration_seconds: number | null;
  thumbnail_key: string | null; published_at: Date | null; created_at: Date; updated_at: Date;
}

export interface MediaObjectRow { object_key: string; content_type: string; byte_size: string; checksum_sha256: string | null; }

export class EpisodeRepository {
  async create(input: { animeId: string; number: number; title: string; description?: string }): Promise<EpisodeRow> {
    const result = await query<EpisodeRow>(
      `INSERT INTO episodes(anime_id, number, title, description) VALUES($1, $2, $3, $4) RETURNING *`,
      [input.animeId, input.number, input.title, input.description ?? ''],
    );
    return result.rows[0]!;
  }

  async list(animeId: string, includeUnpublished: boolean): Promise<EpisodeRow[]> {
    const result = await query<EpisodeRow>(
      `SELECT * FROM episodes WHERE anime_id = $1 AND ($2::boolean OR status = 'published') ORDER BY number`,
      [animeId, includeUnpublished],
    );
    return result.rows;
  }

  async findById(id: string): Promise<EpisodeRow | null> {
    const result = await query<EpisodeRow>('SELECT * FROM episodes WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  async findByAnimeAndNumber(animeId: string, number: number): Promise<EpisodeRow | null> {
    const result = await query<EpisodeRow>('SELECT * FROM episodes WHERE anime_id = $1 AND number = $2', [animeId, number]);
    return result.rows[0] ?? null;
  }

  async update(id: string, input: { number?: number; title?: string; description?: string }): Promise<EpisodeRow | null> {
    const result = await query<EpisodeRow>(
      `UPDATE episodes SET number = COALESCE($2, number), title = COALESCE($3, title), description = COALESCE($4, description)
       WHERE id = $1 RETURNING *`,
      [id, input.number ?? null, input.title ?? null, input.description ?? null],
    );
    return result.rows[0] ?? null;
  }

  async replacePackage(input: {
    episodeId: string; packagePrefix: string; manifest: Record<string, unknown>; metadata: Record<string, unknown>;
    durationSeconds: number | null; thumbnailKey: string; media: MediaObjectRow[];
  }): Promise<string[]> {
    return withTransaction(async (client) => {
      const old = await client.query<{ object_key: string }>('SELECT object_key FROM media_objects WHERE episode_id = $1 FOR UPDATE', [input.episodeId]);
      const episode = await client.query<EpisodeRow>(
        `UPDATE episodes SET package_prefix = $2, manifest = $3::jsonb, metadata = $4::jsonb, duration_seconds = $5,
         thumbnail_key = $6, status = 'draft' WHERE id = $1 RETURNING *`,
        [input.episodeId, input.packagePrefix, JSON.stringify(input.manifest), JSON.stringify(input.metadata), input.durationSeconds, input.thumbnailKey],
      );
      if (!episode.rowCount) throw new Error('Episode disappeared during package upload');
      await client.query('DELETE FROM media_objects WHERE episode_id = $1', [input.episodeId]);
      for (const media of input.media) {
        await client.query(
          `INSERT INTO media_objects(episode_id, object_key, content_type, byte_size, checksum_sha256)
           VALUES($1, $2, $3, $4, $5)`,
          [input.episodeId, media.object_key, media.content_type, media.byte_size, media.checksum_sha256],
        );
      }
      return old.rows.map((row) => row.object_key);
    });
  }

  async publish(id: string): Promise<EpisodeRow | null> {
    const result = await query<EpisodeRow>(
      `UPDATE episodes SET status = 'published', published_at = COALESCE(published_at, now())
       WHERE id = $1 AND package_prefix IS NOT NULL RETURNING *`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getMedia(episodeId: string, objectKey: string): Promise<MediaObjectRow | null> {
    const result = await query<MediaObjectRow>(
      'SELECT object_key, content_type, byte_size, checksum_sha256 FROM media_objects WHERE episode_id = $1 AND object_key = $2',
      [episodeId, objectKey],
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<string[]> {
    return withTransaction(async (client) => {
      const objects = await client.query<{ object_key: string }>('SELECT object_key FROM media_objects WHERE episode_id = $1', [id]);
      const result = await client.query('DELETE FROM episodes WHERE id = $1', [id]);
      if (!result.rowCount) return [];
      return objects.rows.map((row) => row.object_key);
    });
  }
}
