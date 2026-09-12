import { Worker } from 'bullmq';
import { redis } from '../redis/client.js';
import { logger } from '../services/logger.service.js';
import { storage } from '../storage/index.js';
import type { MediaCleanupJob } from './media-cleanup.queue.js';

let worker: Worker<MediaCleanupJob, void, 'delete-objects'> | undefined;

export const startMediaCleanupWorker = (): Worker<MediaCleanupJob, void, 'delete-objects'> => {
  if (worker) return worker;
  worker = new Worker<MediaCleanupJob, void, 'delete-objects'>(
    'media-cleanup',
    async (job) => {
      await storage.removeObjects(job.data.keys);
      await logger.system('info', 'media.cleanup', 'Media objects deleted', { count: job.data.keys.length, jobId: job.id });
    },
    { connection: redis.duplicate(), concurrency: 4 },
  );
  worker.on('error', (error) => { void logger.system('error', 'media.cleanup.error', error.message); });
  return worker;
};

export const stopMediaCleanupWorker = async (): Promise<void> => { if (worker) await worker.close(); };
