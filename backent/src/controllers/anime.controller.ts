import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { success } from '../utils/response.js';
import { animeService } from '../services/anime.service.js';
import { EpisodeRepository } from '../repositories/episode.repository.js';
import { mediaService } from '../services/media.service.js';
import { logger } from '../services/logger.service.js';
import { storage } from '../storage/index.js';
import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../errors/app-error.js';
import {
  getString,
  getOptionalString,
  getNumber,
} from '../utils/request.js';

type Handler = RequestHandler<Record<string, string>>;

const episodes = new EpisodeRepository();
const serializeEpisode = (episode: Awaited<ReturnType<EpisodeRepository['findById']>> & {}) => episode && ({
  id: episode.id, animeId: episode.anime_id, number: episode.number, title: episode.title, description: episode.description,
  status: episode.status, durationSeconds: episode.duration_seconds, thumbnailKey: episode.thumbnail_key,
  publishedAt: episode.published_at, createdAt: episode.created_at, updatedAt: episode.updated_at,
});

export const listAnime: Handler = asyncHandler(async (req, res) => {
  const search = getOptionalString(req.query.search);
  const genre = getOptionalString(req.query.genre);
  const tag = getOptionalString(req.query.tag);
  const limit = getNumber(req.query.limit, 20);
  const offset = getNumber(req.query.offset, 0);
  success(res, await animeService.list({ search, genre, tag, limit, offset }));
});
export const listMyAnime: Handler = asyncHandler(async (req, res) => {
  const limit = getNumber(req.query.limit, 20);
  const offset = getNumber(req.query.offset, 0);
  success(res, await animeService.listMine(req.auth!, limit, offset));
});
export const getAnime: Handler = asyncHandler(async (req, res) => {
  const identifier = getString(req.params.identifier);
  success(res, await animeService.get(identifier, req.auth));
});
export const createAnime: Handler = asyncHandler(async (req, res) => {
  const anime = await animeService.create(req.auth!, req.body);
  await logger.audit('anime.create', 'Anime created', req, { animeId: anime.id });
  success(res, anime, 'Anime created', 201);
});
export const updateAnime: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.id);
  const anime = await animeService.update(req.auth!, animeId, req.body);
  await logger.audit('anime.update', 'Anime updated', req, { animeId: anime.id });
  success(res, anime, 'Anime updated');
});
export const publishAnime: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.id);
  const anime = await animeService.publish(req.auth!, animeId);
  await logger.audit('anime.publish', 'Anime published', req, { animeId: anime.id });
  success(res, anime, 'Anime published');
});
export const deleteAnime: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.id);
  await animeService.delete(req.auth!, animeId);
  await logger.audit('anime.delete', 'Anime deleted', req, { animeId });
  success(res, null, 'Anime deleted');
});
export const uploadAnimeAsset: Handler = asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Image file is required');
  const kind = getString(req.params.kind) as 'cover' | 'banner';
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[req.file.mimetype];
  if (!extension) throw badRequest('Unsupported image type');
  const animeId = getString(req.params.id);
  const anime = await animeService.getManageable(req.auth!, animeId);
  const key = `anime/${anime.id}/${kind}/${randomUUID()}.${extension}`;
  await storage.putObject(key, req.file.buffer, req.file.mimetype);
  try {
    const result = await animeService.saveImage(req.auth!, anime.id, kind, key);
    if (result.previousKey) await storage.removeObjects([result.previousKey]).catch(() => undefined);
    await logger.audit('anime.asset.upload', 'Anime asset uploaded', req, { animeId: anime.id, kind, objectKey: key });
    success(res, { key }, `${kind} uploaded`);
  } catch (error) {
    await storage.removeObjects([key]).catch(() => undefined);
    throw error;
  }
});

export const listEpisodes: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const anime = await animeService.get(animeId, req.auth);
  const includeUnpublished = Boolean(req.auth && (req.auth.role === 'admin' || anime.owner.id === req.auth.id));
  success(res, (await episodes.list(anime.id, includeUnpublished)).map(serializeEpisode));
});
export const createEpisode: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const anime = await animeService.getManageable(req.auth!, animeId);
  const episode = await episodes.create({ animeId: anime.id, ...req.body });
  await logger.audit('episode.create', 'Episode created', req, { episodeId: episode.id, animeId: anime.id });
  success(res, serializeEpisode(episode), 'Episode created', 201);
});
export const updateEpisode: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const episodeId = getString(req.params.episodeId);
  const anime = await animeService.getManageable(req.auth!, animeId);
  const current = await episodes.findById(episodeId);
  if (!current || current.anime_id !== anime.id) throw notFound('Episode');
  const episode = await episodes.update(current.id, req.body);
  if (!episode) throw notFound('Episode');
  await logger.audit('episode.update', 'Episode updated', req, { episodeId: episode.id });
  success(res, serializeEpisode(episode), 'Episode updated');
});
export const publishEpisode: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const episodeId = getString(req.params.episodeId);
  const episode = await mediaService.publishEpisode(req.auth!, animeId, episodeId);
  await logger.audit('episode.publish', 'Episode published', req, { episodeId: episode.id });
  success(res, serializeEpisode(episode), 'Episode published');
});
export const deleteEpisode: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const episodeId = getString(req.params.episodeId);
  await mediaService.deleteEpisode(req.auth!, animeId, episodeId);
  await logger.audit('episode.delete', 'Episode deleted', req, { episodeId });
  success(res, null, 'Episode deleted');
});