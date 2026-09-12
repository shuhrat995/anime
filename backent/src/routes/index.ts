import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Router } from 'express';
import Joi from 'joi';
import multer from 'multer';
import { env } from '../config/env.js';
import { authenticate, authenticateOptional } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validate } from '../middleware/validate.js';
import * as auth from '../controllers/auth.controller.js';
import * as anime from '../controllers/anime.controller.js';
import * as catalog from '../controllers/catalog.controller.js';
import * as user from '../controllers/user.controller.js';
import * as media from '../controllers/media.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { AppError } from '../errors/app-error.js';

const id = Joi.string().uuid({ version: 'uuidv4' });
const nonEmpty = Joi.string().trim().min(1);
const pagination = Joi.object({ limit: Joi.number().integer().min(1).max(100).default(20), offset: Joi.number().integer().min(0).default(0) });
const animeInput = Joi.object({
  title: nonEmpty.max(250).required(), slug: Joi.string().trim().max(280), synopsis: Joi.string().allow('').max(20_000),
  releaseYear: Joi.number().integer().min(1900).max(2200), studioId: id.allow(null),
  genreIds: Joi.array().items(id).unique().max(20), tagIds: Joi.array().items(id).unique().max(30),
});
const animeUpdate = animeInput.fork(['title'], (schema) => schema.optional()).min(1);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const imageUpload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageMimeTypes.has(file.mimetype)) callback(new AppError(422, 'INVALID_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are allowed'));
    else callback(null, true);
  },
});
const uploadDirectory = join(tmpdir(), 'anime-platform-packages');
mkdirSync(uploadDirectory, { recursive: true });
const packageUpload = multer({
  storage: multer.diskStorage({ destination: uploadDirectory, filename: (_req, file, callback) => callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`) }),
  limits: { fileSize: env.maxPackageBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['application/zip', 'application/x-zip-compressed'].includes(file.mimetype)) callback(new AppError(422, 'INVALID_MEDIA_TYPE', 'Episode package must be a ZIP archive'));
    else callback(null, true);
  },
});

export const createApiRouter = (): Router => {
  const router = express.Router();

  router.post('/auth/register', rateLimit('register', 5, 3600), validate({ body: Joi.object({ email: Joi.string().email().max(320).required(), password: Joi.string().min(12).max(128).required(), displayName: nonEmpty.max(100).required() }) }), auth.register);
  router.post('/auth/login', rateLimit('login', 10, 900), validate({ body: Joi.object({ email: Joi.string().email().max(320).required(), password: Joi.string().max(128).required() }) }), auth.login);
  router.post('/auth/refresh', rateLimit('refresh', 30, 900), validate({ body: Joi.object({ refreshToken: Joi.string().min(20).required() }) }), auth.refresh);
  router.post('/auth/logout', authenticate, validate({ body: Joi.object({}) }), auth.logout);

  router.get('/users/me', authenticate, validate({ query: Joi.object({}) }), auth.me);
  router.patch('/users/me', authenticate, validate({ body: Joi.object({ displayName: nonEmpty.max(100) }).min(1) }), auth.updateMe);
  router.post('/users/me/avatar', authenticate, imageUpload.single('file'), validate({ body: Joi.object({}) }), user.uploadAvatar);
  router.get('/users/me/favorites', authenticate, validate({ query: Joi.object({}) }), user.listFavorites);
  router.post('/users/me/favorites/:animeId', authenticate, validate({ params: Joi.object({ animeId: id.required() }), body: Joi.object({}) }), user.addFavorite);
  router.delete('/users/me/favorites/:animeId', authenticate, validate({ params: Joi.object({ animeId: id.required() }), query: Joi.object({}) }), user.removeFavorite);
  router.get('/users/me/history', authenticate, validate({ query: Joi.object({}) }), user.listHistory);
  router.put('/users/me/history/:episodeId', authenticate, validate({ params: Joi.object({ episodeId: id.required() }), body: Joi.object({ positionSeconds: Joi.number().integer().min(0).required(), completed: Joi.boolean() }) }), user.updateHistory);

  router.get('/anime', validate({ query: Joi.object({ search: Joi.string().trim().max(250), genre: Joi.string().trim().max(100), tag: Joi.string().trim().max(100) }).concat(pagination) }), anime.listAnime);
  router.get('/anime/mine', authenticate, authorize('dubber', 'admin'), validate({ query: pagination }), anime.listMyAnime);
  router.post('/anime', authenticate, authorize('dubber', 'admin'), validate({ body: animeInput }), anime.createAnime);
  router.get('/anime/:identifier', authenticateOptional, validate({ params: Joi.object({ identifier: nonEmpty.max(280).required() }), query: Joi.object({}) }), anime.getAnime);
  router.patch('/anime/:id', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ id: id.required() }), body: animeUpdate }), anime.updateAnime);
  router.delete('/anime/:id', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ id: id.required() }), query: Joi.object({}) }), anime.deleteAnime);
  router.post('/anime/:id/publish', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ id: id.required() }), body: Joi.object({}) }), anime.publishAnime);
  router.post('/anime/:id/assets/:kind', authenticate, authorize('dubber', 'admin'), imageUpload.single('file'), validate({ params: Joi.object({ id: id.required(), kind: Joi.string().valid('cover', 'banner').required() }), body: Joi.object({}) }), anime.uploadAnimeAsset);
  router.get('/anime/:animeId/episodes', authenticateOptional, validate({ params: Joi.object({ animeId: id.required() }), query: Joi.object({}) }), anime.listEpisodes);
  router.post('/anime/:animeId/episodes', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ animeId: id.required() }), body: Joi.object({ number: Joi.number().integer().min(1).required(), title: nonEmpty.max(250).required(), description: Joi.string().allow('').max(20_000) }) }), anime.createEpisode);
  router.patch('/anime/:animeId/episodes/:episodeId', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ animeId: id.required(), episodeId: id.required() }), body: Joi.object({ number: Joi.number().integer().min(1), title: nonEmpty.max(250), description: Joi.string().allow('').max(20_000) }).min(1) }), anime.updateEpisode);
  router.delete('/anime/:animeId/episodes/:episodeId', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ animeId: id.required(), episodeId: id.required() }), query: Joi.object({}) }), anime.deleteEpisode);
  router.post('/anime/:animeId/episodes/:episodeId/publish', authenticate, authorize('dubber', 'admin'), validate({ params: Joi.object({ animeId: id.required(), episodeId: id.required() }), body: Joi.object({}) }), anime.publishEpisode);
  router.post('/anime/:animeId/episodes/:episodeId/package', authenticate, authorize('dubber', 'admin'), packageUpload.single('package'), validate({ params: Joi.object({ animeId: id.required(), episodeId: id.required() }), body: Joi.object({}) }), media.uploadPackage);

  router.get('/catalog/:resource', validate({ params: Joi.object({ resource: Joi.string().valid('genres', 'studios', 'tags').required() }), query: Joi.object({}) }), catalog.listCatalog);
  router.post('/admin/catalog/:resource', authenticate, authorize('admin'), validate({ params: Joi.object({ resource: Joi.string().valid('genres', 'studios', 'tags').required() }), body: Joi.object({ name: nonEmpty.max(120).required(), slug: Joi.string().trim().max(140) }) }), catalog.createCatalog);
  router.patch('/admin/catalog/:resource/:id', authenticate, authorize('admin'), validate({ params: Joi.object({ resource: Joi.string().valid('genres', 'studios', 'tags').required(), id: id.required() }), body: Joi.object({ name: nonEmpty.max(120), slug: Joi.string().trim().max(140) }).min(1) }), catalog.updateCatalog);
  router.delete('/admin/catalog/:resource/:id', authenticate, authorize('admin'), validate({ params: Joi.object({ resource: Joi.string().valid('genres', 'studios', 'tags').required(), id: id.required() }), query: Joi.object({}) }), catalog.deleteCatalog);
  router.get('/admin/logs', authenticate, authorize('admin'), validate({ query: Joi.object({ category: Joi.string().valid('audit', 'security', 'system'), userId: id, limit: Joi.number().integer().min(1).max(100).default(50), offset: Joi.number().integer().min(0).default(0) }) }), admin.listLogs);
  router.patch('/admin/users/:id/role', authenticate, authorize('admin'), validate({ params: Joi.object({ id: id.required() }), body: Joi.object({ role: Joi.string().valid('user', 'dubber', 'admin').required() }) }), admin.changeUserRole);
  router.get('/admin/anime/:animeId/access', authenticate, authorize('admin'), validate({ params: Joi.object({ animeId: id.required() }), query: Joi.object({}) }), admin.listAnimeAccess);
  router.post('/admin/anime/:animeId/access', authenticate, authorize('admin'), validate({ params: Joi.object({ animeId: id.required() }), body: Joi.object({ userId: id.required(), expiresAt: Joi.date().iso().greater('now').allow(null) }) }), admin.grantAnimeAccess);
  router.delete('/admin/anime/:animeId/access/:userId', authenticate, authorize('admin'), validate({ params: Joi.object({ animeId: id.required(), userId: id.required() }), query: Joi.object({}) }), admin.revokeAnimeAccess);
  router.patch('/admin/anime/:animeId/visibility', authenticate, authorize('admin'), validate({ params: Joi.object({ animeId: id.required() }), body: Joi.object({ visibility: Joi.string().valid('public', 'restricted').required() }) }), admin.setAnimeVisibility);

  router.get('/media/play/:token', rateLimit('media-play', 4000, 300), validate({ params: Joi.object({ token: Joi.string().trim().min(20).max(4096).required() }), query: Joi.object({ file: Joi.string().trim().max(500) }) }), media.playMedia);
  router.post('/media/:episodeId/playback', authenticate, rateLimit('media-playback', 120, 900), validate({ params: Joi.object({ episodeId: id.required() }), body: Joi.object({}) }), media.issuePlayback);
  return router;
};
