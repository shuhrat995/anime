import type { RequestHandler } from 'express';
import { db } from '../database/pool.js';
import { redis } from '../redis/client.js';
import { storage } from '../storage/index.js';
import { mediaService } from '../services/media.service.js';
import { success } from '../utils/response.js';
import { metricsRegistry } from '../monitoring/metrics.js';

const checkDatabase = async () => { await db.query('SELECT 1'); return { healthy: true }; };
const checkRedis = async () => ({ healthy: (await redis.ping()) === 'PONG' });

export const health: RequestHandler = (_req, res) => success(res, { status: 'ok' });
export const live: RequestHandler = (_req, res) => success(res, { status: 'live' });
export const databaseHealth: RequestHandler = async (_req, res) => {
  try { success(res, { database: await checkDatabase() }); } catch { res.status(503); success(res, { database: { healthy: false } }, 'Database unavailable', 503); }
};
export const redisHealth: RequestHandler = async (_req, res) => {
  try { success(res, { redis: await checkRedis() }); } catch { success(res, { redis: { healthy: false } }, 'Redis unavailable', 503); }
};
export const storageHealth: RequestHandler = async (_req, res) => {
  const status = await storage.health();
  success(res, { storage: status }, status.healthy ? 'Success' : 'Storage unavailable', status.healthy ? 200 : 503);
};
export const ready: RequestHandler = async (_req, res) => {
  const [database, redisResult, storageResult] = await Promise.allSettled([checkDatabase(), checkRedis(), storage.health()]);
  const data = {
    database: database.status === 'fulfilled' ? database.value : { healthy: false },
    redis: redisResult.status === 'fulfilled' ? redisResult.value : { healthy: false },
    storage: storageResult.status === 'fulfilled' ? storageResult.value : { healthy: false },
  };
  const healthy = data.database.healthy && data.redis.healthy && data.storage.healthy;
  success(res, data, healthy ? 'Ready' : 'Dependencies unavailable', healthy ? 200 : 503);
};
export const metrics: RequestHandler = async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
};
export const queueStatus: RequestHandler = async (_req, res) => success(res, await mediaService.queueStatus());
