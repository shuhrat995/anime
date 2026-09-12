import { createHash } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { badRequest, forbidden, notFound } from '../errors/app-error.js';
import type { AuthUser } from '../core/types.js';
import { accessRepository } from '../repositories/access.repository.js';
import { AnimeRepository } from '../repositories/anime.repository.js';
import { EpisodeRepository, type EpisodeRow, type MediaObjectRow } from '../repositories/episode.repository.js';
import type { PlaybackClaims } from './playback.service.js';
import { storage } from '../storage/index.js';
import { enqueueMediaDeletion } from '../workers/media-cleanup.queue.js';
import { streamZipEntries, validateEpisodePackage } from '../media/package-validator.js';

const episodes = new EpisodeRepository();
const anime = new AnimeRepository();
const assertSafePath = (relativePath: string): void => {
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..') || relativePath.includes('\\')) throw badRequest('Invalid media path');
};
const contentType = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return ({ m3u8: 'application/vnd.apple.mpegurl', ts: 'video/mp2t', m4s: 'video/iso.segment', mp4: 'video/mp4',
    vtt: 'text/vtt; charset=utf-8', srt: 'application/x-subrip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', json: 'application/json' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
};

const assertCanManageEpisode = async (user: AuthUser, animeId: string, episodeId: string): Promise<EpisodeRow> => {
  const [animeRow, episode] = await Promise.all([anime.findBySlugOrId(animeId), episodes.findById(episodeId)]);
  if (!animeRow) throw notFound('Anime');
  if (!episode || episode.anime_id !== animeRow.id) throw notFound('Episode');
  if (user.role !== 'admin' && (user.role !== 'dubber' || animeRow.owner_id !== user.id)) throw forbidden();
  return episode;
};

export class MediaService {
  async uploadEpisodePackage(user: AuthUser, animeId: string, episodeId: string, archivePath: string, maxBytes: number) {
    const episode = await assertCanManageEpisode(user, animeId, episodeId);
    const validated = await validateEpisodePackage(archivePath, maxBytes);
    const packagePrefix = `episodes/${episode.id}/${Date.now().toString(36)}`;
    const media: MediaObjectRow[] = [];
    const uploadedKeys: string[] = [];
    try {
      await streamZipEntries(archivePath, async (entry, source) => {
        const name = entry.fileName.replaceAll('\\', '/');
        const key = `${packagePrefix}/${name}`;
        const hash = createHash('sha256');
        const hashingStream = new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
        const readable = source as Readable;
        const upload = storage.putObject(key, readable.pipe(hashingStream), contentType(name));
        await upload;
        uploadedKeys.push(key);
        media.push({ object_key: key, content_type: contentType(name), byte_size: String(entry.uncompressedSize), checksum_sha256: hash.digest('hex') });
      });
      const oldKeys = await episodes.replacePackage({
        episodeId: episode.id, packagePrefix, manifest: validated.manifest, metadata: validated.metadata,
        durationSeconds: validated.durationSeconds, thumbnailKey: `${packagePrefix}/thumbnail.jpg`, media,
      });
      await enqueueMediaDeletion(oldKeys);
      return { episodeId: episode.id, filesStored: media.length, packagePrefix };
    } catch (error) {
      await storage.removeObjects(uploadedKeys).catch(() => undefined);
      throw error;
    }
  }

  async publishEpisode(user: AuthUser, animeId: string, episodeId: string) {
    await assertCanManageEpisode(user, animeId, episodeId);
    const episode = await episodes.publish(episodeId);
    if (!episode) throw badRequest('An episode package must be uploaded before publishing');
    return episode;
  }

  async assertCanWatch(user: AuthUser, episodeId: string): Promise<EpisodeRow> {
    const episode = await episodes.findById(episodeId);
    if (!episode || !episode.package_prefix) throw notFound('Episode media');
    const animeRow = await anime.findById(episode.anime_id);
    if (!animeRow) throw notFound('Episode media');
    if (user.role === 'admin') return episode;
    if (user.role === 'dubber' && animeRow.owner_id === user.id) return episode;
    if (episode.status !== 'published') throw notFound('Episode media');
    if (animeRow.visibility === 'public') return episode;
    if (!(await accessRepository.hasAccess(user.id, animeRow.id))) throw forbidden('You do not have access to this title');
    return episode;
  }

  async streamWithClaims(claims: PlaybackClaims, relativePath: string) {
    assertSafePath(relativePath);
    const object = await episodes.getMedia(claims.eid, `${claims.pfx}/${relativePath}`);
    if (!object) throw notFound('Media object');
    return { stream: await storage.getObject(object.object_key), contentType: object.content_type, contentLength: object.byte_size };
  }

  async deleteEpisode(user: AuthUser, animeId: string, episodeId: string): Promise<void> {
    await assertCanManageEpisode(user, animeId, episodeId);
    await enqueueMediaDeletion(await episodes.delete(episodeId));
  }

  async queueStatus() {
    const { mediaCleanupQueue } = await import('../workers/media-cleanup.queue.js');
    return mediaCleanupQueue.getJobCounts('active', 'waiting', 'delayed', 'failed');
  }
}

export const mediaService = new MediaService();
