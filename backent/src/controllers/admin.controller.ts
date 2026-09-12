import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { success } from '../utils/response.js';
import { logRepository, logger } from '../services/logger.service.js';
import { authService } from '../services/auth.service.js';
import { AnimeRepository } from '../repositories/anime.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { accessRepository, type AccessGrantRow } from '../repositories/access.repository.js';
import { playbackService } from '../services/playback.service.js';
import { notFound } from '../errors/app-error.js';
import { getString, getOptionalString, getNumber } from '../utils/request.js';

type Handler = RequestHandler<Record<string, string>>;

const animeRepository = new AnimeRepository();
const userRepository = new UserRepository();

async function findAnimeOr404(animeId: string) {
  const anime = await animeRepository.findBySlugOrId(animeId);
  if (!anime) throw notFound('Anime');
  return anime;
}

const serializeGrant = (grant: AccessGrantRow) => ({
  userId: grant.user_id,
  animeId: grant.anime_id,
  displayName: grant.display_name,
  email: grant.email,
  grantedBy: grant.granted_by,
  expiresAt: grant.expires_at,
  createdAt: grant.created_at,
});

export const listLogs: Handler = asyncHandler(async (req, res) => {
  const category = getOptionalString(req.query.category) as
    | 'audit'
    | 'security'
    | 'system'
    | undefined;

  const userId = getOptionalString(req.query.userId);

  const limit = getNumber(req.query.limit, 50);
  const offset = getNumber(req.query.offset, 0);

  const logs = await logRepository.list({
    category,
    userId,
    limit,
    offset,
  });

  success(res, logs);
});

export const changeUserRole: Handler = asyncHandler(async (req, res) => {
  const id = getString(req.params.id);
  const role = req.body.role;

  const user = await authService.setRole(id, role);

  await logger.audit(
    'admin.user.role.update',
    'User role changed',
    req,
    {
      targetUserId: user.id,
      role: user.role,
    },
  );

  success(res, user, 'User role updated');
});

export const listAnimeAccess: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);

  const anime = await findAnimeOr404(animeId);
  const grants = await accessRepository.listForAnime(anime.id);

  success(res, grants.map(serializeGrant));
});

export const grantAnimeAccess: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);

  const anime = await findAnimeOr404(animeId);
  const userId = req.body.userId as string;
  const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) throw notFound('User');

  await accessRepository.grant(userId, anime.id, req.auth!.id, expiresAt);

  await logger.audit(
    'admin.anime.access.grant',
    'Anime access granted',
    req,
    {
      animeId: anime.id,
      targetUserId: userId,
      expiresAt,
    },
  );

  success(res, { animeId: anime.id, userId, expiresAt }, 'Access granted', 201);
});

export const revokeAnimeAccess: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);
  const userId = getString(req.params.userId);

  const anime = await findAnimeOr404(animeId);
  const revoked = await accessRepository.revoke(userId, anime.id);

  if (!revoked) throw notFound('Access grant');

  // Kill links already issued to this viewer, otherwise revocation only takes effect once they expire.
  await playbackService.revokeForViewer(anime.id, userId);

  await logger.audit(
    'admin.anime.access.revoke',
    'Anime access revoked',
    req,
    {
      animeId: anime.id,
      targetUserId: userId,
    },
  );

  success(res, null, 'Access revoked');
});

export const setAnimeVisibility: Handler = asyncHandler(async (req, res) => {
  const animeId = getString(req.params.animeId);

  const anime = await findAnimeOr404(animeId);
  const visibility = req.body.visibility as 'public' | 'restricted';

  const updated = await animeRepository.setVisibility(anime.id, visibility);
  if (!updated) throw notFound('Anime');

  // Locking a title down must also invalidate every link handed out while it was open.
  if (visibility === 'restricted') await playbackService.revokeForAnime(updated.id);

  await logger.audit(
    'admin.anime.visibility.update',
    'Anime visibility changed',
    req,
    {
      animeId: updated.id,
      visibility: updated.visibility,
    },
  );

  success(res, { id: updated.id, title: updated.title, slug: updated.slug, visibility: updated.visibility }, 'Anime visibility updated');
});