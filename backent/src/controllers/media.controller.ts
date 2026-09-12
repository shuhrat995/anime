import { unlink } from 'node:fs/promises';
import { posix as path } from 'node:path';
import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest } from '../errors/app-error.js';
import { success } from '../utils/response.js';
import { mediaService } from '../services/media.service.js';
import { playbackService, PLAYBACK_TTL_SECONDS } from '../services/playback.service.js';
import { logger } from '../services/logger.service.js';
import { env } from '../config/env.js';
import {
  getString,
  getOptionalString,
} from '../utils/request.js';

type Handler = RequestHandler<Record<string, string>>;

const DEFAULT_PLAYBACK_FILE = 'master.m3u8';

const isExternalUri = (value: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);

const playPath = (token: string, file: string) =>
  `${env.apiPrefix}/media/play/${encodeURIComponent(token)}?file=${encodeURIComponent(file)}`;

const rewritePlaylistUri = (token: string, currentFile: string, uri: string) => {
  if (!uri || isExternalUri(uri)) return uri;
  const resolved = path.normalize(path.join(path.dirname(currentFile), uri));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) return uri;
  return playPath(token, resolved);
};

const rewritePlaylist = (token: string, file: string, playlist: string) =>
  playlist
    .split(/\r?\n/)
    .map((line) => {
      const withAttributeUris = line.replace(/URI="([^"]+)"/g, (_match, uri: string) =>
        `URI="${rewritePlaylistUri(token, file, uri)}"`,
      );
      if (!withAttributeUris || withAttributeUris.startsWith('#')) return withAttributeUris;
      return rewritePlaylistUri(token, file, withAttributeUris);
    })
    .join('\n');

export const uploadPackage: Handler = asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Episode package file is required');
  const animeId = getString(req.params.animeId);
  const episodeId = getString(req.params.episodeId);
  try {
    const result = await mediaService.uploadEpisodePackage(req.auth!, animeId, episodeId, req.file.path, req.file.size);
    await logger.audit('media.package.upload', 'Episode package uploaded', req, result);
    success(res, result, 'Episode package uploaded');
  } finally {
    await unlink(req.file.path).catch(() => undefined);
  }
});

export const issuePlayback: Handler = asyncHandler(async (req, res) => {
  const episodeId = getString(req.params.episodeId);
  const episode = await mediaService.assertCanWatch(req.auth!, episodeId);
  const token = await playbackService.issue(req.auth!.id, episode.id, episode.anime_id, episode.package_prefix!);
  await logger.audit('media.playback.issue', 'Playback token issued', req, { episodeId: episode.id, animeId: episode.anime_id });
  success(res, { playbackPath: `/media/play/${token}`, expiresIn: PLAYBACK_TTL_SECONDS, durationSeconds: episode.duration_seconds }, 'Playback authorized');
});

export const playMedia: Handler = asyncHandler(async (req, res) => {
  const token = getString(req.params.token);
  const file = getOptionalString(req.query.file) || DEFAULT_PLAYBACK_FILE;
  const claims = await playbackService.verify(token);
  const result = await mediaService.streamWithClaims(claims, file);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (result.contentType === 'application/vnd.apple.mpegurl') {
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    res.send(rewritePlaylist(token, file, Buffer.concat(chunks).toString('utf8')));
    return;
  }
  res.setHeader('Content-Length', result.contentLength);
  result.stream.on('error', (error) => res.destroy(error));
  result.stream.pipe(res);
});
