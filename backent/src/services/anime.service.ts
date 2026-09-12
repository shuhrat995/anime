import { conflict, forbidden, notFound } from '../errors/app-error.js';
import type { AuthUser } from '../core/types.js';
import { AnimeRepository, type AnimeInput, type AnimeRow } from '../repositories/anime.repository.js';
import { toSlug } from '../utils/slug.js';

const animeRepository = new AnimeRepository();

export const serializeAnime = (anime: AnimeRow) => ({
  id: anime.id, title: anime.title, slug: anime.slug, synopsis: anime.synopsis, releaseYear: anime.release_year,
  status: anime.status, visibility: anime.visibility, owner: { id: anime.owner_id, displayName: anime.owner_name },
  studio: anime.studio_id ? { id: anime.studio_id, name: anime.studio_name } : null,
  coverKey: anime.cover_key, bannerKey: anime.banner_key, genres: anime.genres, tags: anime.tags,
  publishedAt: anime.published_at, createdAt: anime.created_at, updatedAt: anime.updated_at,
});

export const canManageAnime = (user: AuthUser, anime: AnimeRow): boolean =>
  user.role === 'admin' || (user.role === 'dubber' && user.id === anime.owner_id);

export class AnimeService {
  async create(user: AuthUser, input: Omit<AnimeInput, 'slug'> & { slug?: string }) {
    const slug = input.slug ? toSlug(input.slug) : toSlug(input.title);
    if (!slug) throw conflict('A valid slug could not be generated from the title');
    try {
      return serializeAnime(await animeRepository.create(user.id, { ...input, slug }));
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw conflict('Anime slug, studio, genre, or tag already exists');
      throw error;
    }
  }

  async list(filters: { search?: string; genre?: string; tag?: string; limit: number; offset: number }) {
    return (await animeRepository.findMany({ ...filters, includeUnpublished: false })).map(serializeAnime);
  }

  async listMine(user: AuthUser, limit: number, offset: number) {
    return (await animeRepository.findMany({ includeUnpublished: true, ownerId: user.role === 'admin' ? undefined : user.id, limit, offset })).map(serializeAnime);
  }

  async get(identifier: string, user?: AuthUser) {
    const anime = await animeRepository.findBySlugOrId(identifier);
    if (!anime) throw notFound('Anime');
    if (anime.status !== 'published' && (!user || !canManageAnime(user, anime))) throw notFound('Anime');
    return serializeAnime(anime);
  }

  async getManageable(user: AuthUser, id: string): Promise<AnimeRow> {
    const anime = await animeRepository.findBySlugOrId(id);
    if (!anime) throw notFound('Anime');
    if (!canManageAnime(user, anime)) throw forbidden();
    return anime;
  }

  async update(user: AuthUser, id: string, input: Partial<Omit<AnimeInput, 'slug'>> & { slug?: string }) {
    await this.getManageable(user, id);
    try {
      const updated = await animeRepository.update(id, { ...input, ...(input.slug === undefined ? {} : { slug: toSlug(input.slug) }) });
      if (!updated) throw notFound('Anime');
      return serializeAnime(updated);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw conflict('Anime slug, studio, genre, or tag already exists');
      throw error;
    }
  }

  async publish(user: AuthUser, id: string) {
    await this.getManageable(user, id);
    const updated = await animeRepository.publish(id);
    if (!updated) throw notFound('Anime');
    return serializeAnime(updated);
  }

  async delete(user: AuthUser, id: string): Promise<void> {
    await this.getManageable(user, id);
    if (!(await animeRepository.delete(id))) throw notFound('Anime');
  }

  async saveImage(user: AuthUser, id: string, kind: 'cover' | 'banner', key: string) {
    const existing = await this.getManageable(user, id);
    const updated = await animeRepository.updateAsset(id, kind, key);
    if (!updated) throw notFound('Anime');
    return { key, previousKey: kind === 'cover' ? existing.cover_key : existing.banner_key };
  }
}

export const animeService = new AnimeService();
