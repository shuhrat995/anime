import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { closeDatabases } from './database/pool.js';
import { closeRedis } from './redis/client.js';
import { logger } from './services/logger.service.js';
import { storage } from './storage/index.js';
import { startMediaCleanupWorker, stopMediaCleanupWorker } from './workers/media-cleanup.worker.js';
import { mediaCleanupQueue } from './workers/media-cleanup.queue.js';

const start = async (): Promise<void> => {
  try { await storage.ensureReady(); }
  catch (error) { await logger.system('error', 'storage.initialize.failed', 'Storage could not be initialized', { reason: error instanceof Error ? error.message : String(error) }); }
  startMediaCleanupWorker();
  const server = createServer(createApp());
  const shutdown = async (signal: string) => {
    await logger.system('info', 'server.shutdown', `Received ${signal}`);
    server.close(async () => {
      await Promise.allSettled([stopMediaCleanupWorker(), mediaCleanupQueue.close(), closeRedis(), closeDatabases()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  server.listen(env.port, () => { void logger.system('info', 'server.started', 'API server listening', { port: env.port, environment: env.nodeEnv }); });
};

start().catch(async (error: unknown) => {
  await logger.system('error', 'server.start.failed', error instanceof Error ? error.message : String(error));
  process.stderr.write(`Server start failed: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
