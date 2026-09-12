import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { success } from '../utils/response.js';
import { badRequest, notFound } from '../errors/app-error.js';
import { authService } from '../services/auth.service.js';
import { storage } from '../storage/index.js';
import { WatchRepository } from '../repositories/watch.repository.js';
import { AnimeRepository } from '../repositories/anime.repository.js';
import { EpisodeRepository } from '../repositories/episode.repository.js';
import { logger } from '../services/logger.service.js';
import {
  getString,
} from '../utils/request.js';

type Handler = RequestHandler<Record<string, string>>;

const watch = new WatchRepository();
const anime = new AnimeRepository();
const episodes = new EpisodeRepository();
const extensionForImage = (mime: string): string => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime] ?? '');

export const uploadAvatar: Handler = asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Avatar file is required');
  const extension = extensionForImage(req.file.mimetype);
  if (!extension) throw badRequest('Unsupported avatar image type');
  const previous = await authService.getProfile(req.auth!.id);
  const key = `avatars/${req.auth!.id}/${randomUUID()}.${extension}`;
  await storage.putObject(key, req.file.buffer, req.file.mimetype);
  try {
    const user = await authService.updateProfile(req.auth!.id, { avatarKey: key });
    if (previous.avatarKey) await storage.removeObjects([previous.avatarKey]).catch(() => undefined);
    await logger.audit('user.avatar.upload', 'Avatar uploaded', req, { objectKey: key });
    success(res, user, 'Avatar uploaded');
  } catch (error) {
    await storage.removeObjects([key]).catch(() => undefined);
    throw error;
  }
});

export const listFavorites: Handler = asyncHandler(async (req, res) => {
  success(res, await watch.listFavorites(req.auth!.id));
});
export const addFavorite: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const value = await anime.findBySlugOrId(animeId);
  if (!value || value.status !== 'published') throw notFound('Anime');
  await watch.addFavorite(req.auth!.id, value.id);
  await logger.audit('favorite.add', 'Favorite added', req, { animeId: value.id });
  success(res, null, 'Favorite added', 201);
});
export const removeFavorite: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  await watch.removeFavorite(req.auth!.id, animeId);
  await logger.audit('favorite.remove', 'Favorite removed', req, { animeId });
  success(res, null, 'Favorite removed');
});
export const listHistory: Handler = asyncHandler(async (req, res) => {
  success(res, await watch.listHistory(req.auth!.id));
});
export const updateHistory: Handler = asyncHandler(async (req, res) => {
  const episodeId = getString(req.params.episodeId);
  const episode = await episodes.findById(episodeId);
  if (!episode || episode.status !== 'published') throw notFound('Episode');
  const progress = await watch.updateProgress(req.auth!.id, episode.id, req.body.positionSeconds, req.body.completed ?? false);
  success(res, progress, 'Watch progress updated');
});