import { randomBytes } from 'node:crypto';
import { unauthorized } from '../errors/app-error.js';
import { redis } from '../redis/client.js';

export interface PlaybackClaims { sub: string; eid: string; aid: string; pfx: string }

export const PLAYBACK_TTL_SECONDS = 3600;

const tokenKey = (token: string) => `playback:tok:${token}`;
const indexKey = (animeId: string, userId: string) => `playback:idx:${animeId}:${userId}`;

export class PlaybackService {
  /**
   * Issues an opaque random handle. The claims stay server side, so the playback URL leaks neither the
   * episode id nor the internal object-storage prefix — unlike a signed JWT, whose payload is readable.
   */
  async issue(userId: string, episodeId: string, animeId: string, packagePrefix: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const claims: PlaybackClaims = { sub: userId, eid: episodeId, aid: animeId, pfx: packagePrefix };
    const index = indexKey(animeId, userId);
    await redis
      .multi()
      .set(tokenKey(token), JSON.stringify(claims), 'EX', PLAYBACK_TTL_SECONDS)
      .sadd(index, token)
      .expire(index, PLAYBACK_TTL_SECONDS)
      .exec();
    return token;
  }

  async verify(token: string): Promise<PlaybackClaims> {
    const raw = await redis.get(tokenKey(token));
    if (!raw) throw unauthorized('Playback link expired');
    try {
      const claims = JSON.parse(raw) as PlaybackClaims;
      if (!claims.sub || !claims.eid || !claims.aid || !claims.pfx) throw new Error('Malformed playback claims');
      return claims;
    } catch {
      throw unauthorized('Playback link expired');
    }
  }

  /** Kills every link already handed to one viewer for one title (used when an admin revokes their grant). */
  async revokeForViewer(animeId: string, userId: string): Promise<void> {
    await this.dropIndex(indexKey(animeId, userId));
  }

  /** Kills every outstanding link for a title (used when it flips from public to restricted). */
  async revokeForAnime(animeId: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `playback:idx:${animeId}:*`, 'COUNT', 200);
      cursor = next;
      for (const index of keys) await this.dropIndex(index);
    } while (cursor !== '0');
  }

  private async dropIndex(index: string): Promise<void> {
    const tokens = await redis.smembers(index);
    if (tokens.length > 0) await redis.del(...tokens.map(tokenKey));
    await redis.del(index);
  }
}

export const playbackService = new PlaybackService();
