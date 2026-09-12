import type { PoolClient } from 'pg';
import { query, withTransaction } from '../database/pool.js';

export interface AnimeRow {
  id: string; title: string; slug: string; synopsis: string; release_year: number | null;
  status: 'draft' | 'published' | 'archived'; visibility: 'public' | 'restricted'; owner_id: string; studio_id: string | null;
  cover_key: string | null; banner_key: string | null; published_at: Date | null; created_at: Date; updated_at: Date;
  owner_name: string; studio_name: string | null; genres: unknown; tags: unknown;
}

export interface AnimeInput {
  title: string; slug: string; synopsis?: string; releaseYear?: number; studioId?: string | null;
  genreIds?: string[]; tagIds?: string[];
}

const selectAnime = `
  SELECT a.*, u.display_name AS owner_name, s.name AS studio_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug) ORDER BY g.name)
      FROM anime_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.anime_id = a.id), '[]'::jsonb) AS genres,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) ORDER BY t.name)
      FROM anime_tags at JOIN tags t ON t.id = at.tag_id WHERE at.anime_id = a.id), '[]'::jsonb) AS tags
  FROM anime a JOIN users u ON u.id = a.owner_id LEFT JOIN studios s ON s.id = a.studio_id`;

const replaceRelations = async (client: PoolClient, animeId: string, genreIds?: string[], tagIds?: string[]) => {
  if (genreIds !== undefined) {
    await client.query('DELETE FROM anime_genres WHERE anime_id = $1', [animeId]);
    for (const genreId of genreIds) await client.query('INSERT INTO anime_genres(anime_id, genre_id) VALUES ($1, $2)', [animeId, genreId]);
  }
  if (tagIds !== undefined) {
    await client.query('DELETE FROM anime_tags WHERE anime_id = $1', [animeId]);
    for (const tagId of tagIds) await client.query('INSERT INTO anime_tags(anime_id, tag_id) VALUES ($1, $2)', [animeId, tagId]);
  }
};

export class AnimeRepository {
  async create(ownerId: string, input: AnimeInput): Promise<AnimeRow> {
    return withTransaction(async (client) => {
      const inserted = await client.query<AnimeRow>(
        `INSERT INTO anime(title, slug, synopsis, release_year, owner_id, studio_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [input.title, input.slug, input.synopsis ?? '', input.releaseYear ?? null, ownerId, input.studioId ?? null],
      );
      const anime = inserted.rows[0]!;
      await replaceRelations(client, anime.id, input.genreIds, input.tagIds);
      const result = await client.query<AnimeRow>(`${selectAnime} WHERE a.id = $1`, [anime.id]);
      return result.rows[0]!;
    });
  }

  async findBySlugOrId(identifier: string): Promise<AnimeRow | null> {
    // Slugs are user supplied and can be crafted to equal another row's id, so an exact id match must always win.
    const result = await query<AnimeRow>(
      `${selectAnime} WHERE a.slug = $1 OR a.id::text = $1 ORDER BY (a.id::text = $1) DESC LIMIT 1`,
      [identifier],
    );
    return result.rows[0] ?? null;
  }

  // Strict lookup for callers that already hold a trusted id (never reachable by a crafted slug).
  async findById(id: string): Promise<AnimeRow | null> {
    const result = await query<AnimeRow>(`${selectAnime} WHERE a.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findMany(filters: { search?: string; genre?: string; tag?: string; ownerId?: string; includeUnpublished: boolean; limit: number; offset: number }) {
    const clauses = [
      '($1::boolean = true OR a.status = \'published\')',
      '($2::text IS NULL OR to_tsvector(\'simple\', a.title || \' \' || a.synopsis) @@ plainto_tsquery(\'simple\', $2))',
      '($3::text IS NULL OR EXISTS (SELECT 1 FROM anime_genres ag JOIN genres g ON g.id = ag.genre_id WHERE ag.anime_id = a.id AND g.slug = $3))',
      '($4::text IS NULL OR EXISTS (SELECT 1 FROM anime_tags at JOIN tags t ON t.id = at.tag_id WHERE at.anime_id = a.id AND t.slug = $4))',
      '($5::uuid IS NULL OR a.owner_id = $5)',
    ];
    const result = await query<AnimeRow>(
      `${selectAnime} WHERE ${clauses.join(' AND ')} ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC LIMIT $6 OFFSET $7`,
      [filters.includeUnpublished, filters.search ?? null, filters.genre ?? null, filters.tag ?? null, filters.ownerId ?? null, filters.limit, filters.offset],
    );
    return result.rows;
  }

  async update(id: string, input: Partial<AnimeInput>): Promise<AnimeRow | null> {
    return withTransaction(async (client) => {
      const existing = await client.query<AnimeRow>('SELECT * FROM anime WHERE id = $1 FOR UPDATE', [id]);
      if (!existing.rowCount) return null;
      const result = await client.query<AnimeRow>(
        `UPDATE anime SET
          title = COALESCE($2, title), slug = COALESCE($3, slug), synopsis = COALESCE($4, synopsis),
          release_year = CASE WHEN $5 THEN $6::smallint ELSE release_year END,
          studio_id = CASE WHEN $7 THEN $8::uuid ELSE studio_id END
         WHERE id = $1 RETURNING *`,
        [id, input.title ?? null, input.slug ?? null, input.synopsis ?? null, input.releaseYear !== undefined, input.releaseYear ?? null,
          input.studioId !== undefined, input.studioId ?? null],
      );
      await replaceRelations(client, id, input.genreIds, input.tagIds);
      const selected = await client.query<AnimeRow>(`${selectAnime} WHERE a.id = $1`, [id]);
      return selected.rows[0] ?? result.rows[0] ?? null;
    });
  }

  async publish(id: string): Promise<AnimeRow | null> {
    const result = await query<AnimeRow>(
      `UPDATE anime SET status = 'published', published_at = COALESCE(published_at, now()) WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!result.rowCount) return null;
    return this.findBySlugOrId(id);
  }

  async setVisibility(animeId: string, visibility: 'public' | 'restricted'): Promise<AnimeRow | null> {
    // Resolve to exactly one row first — a bare "slug = $1 OR id::text = $1" UPDATE would rewrite every match.
    const target = await this.findBySlugOrId(animeId);
    if (!target) return null;
    await query('UPDATE anime SET visibility = $2 WHERE id = $1', [target.id, visibility]);
    return this.findById(target.id);
  }

  async updateAsset(id: string, kind: 'cover' | 'banner', key: string): Promise<AnimeRow | null> {
    const field = kind === 'cover' ? 'cover_key' : 'banner_key';
    const result = await query<AnimeRow>(`UPDATE anime SET ${field} = $2 WHERE id = $1 RETURNING *`, [id, key]);
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM anime WHERE id = $1', [id]);
    return Boolean(result.rowCount);
  }
}
