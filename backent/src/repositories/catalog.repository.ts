import { query } from '../database/pool.js';

export const CATALOG_RESOURCES = ['genres', 'studios', 'tags'] as const;
export type CatalogResource = (typeof CATALOG_RESOURCES)[number];
export interface CatalogRow { id: string; name: string; slug: string; created_at: Date; }

const tableFor = (resource: CatalogResource) => resource;

export class CatalogRepository {
  list(resource: CatalogResource): Promise<CatalogRow[]> {
    return query<CatalogRow>(`SELECT id, name, slug, created_at FROM ${tableFor(resource)} ORDER BY name`).then((result) => result.rows);
  }

  async create(resource: CatalogResource, name: string, slug: string): Promise<CatalogRow> {
    const result = await query<CatalogRow>(`INSERT INTO ${tableFor(resource)}(name, slug) VALUES($1, $2) RETURNING *`, [name, slug]);
    return result.rows[0]!;
  }

  async update(resource: CatalogResource, id: string, input: { name?: string; slug?: string }): Promise<CatalogRow | null> {
    const result = await query<CatalogRow>(
      `UPDATE ${tableFor(resource)} SET name = COALESCE($2, name), slug = COALESCE($3, slug) WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.slug ?? null],
    );
    return result.rows[0] ?? null;
  }

  async delete(resource: CatalogResource, id: string): Promise<boolean> {
    const result = await query(`DELETE FROM ${tableFor(resource)} WHERE id = $1`, [id]);
    return Boolean(result.rowCount);
  }
}
