import { Queue } from 'bullmq';
import { redis } from '../redis/client.js';

export interface MediaCleanupJob { keys: string[]; }

export const mediaCleanupQueue = new Queue<MediaCleanupJob, void, 'delete-objects'>('media-cleanup', {
  connection: redis,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
});

export const enqueueMediaDeletion = async (keys: string[]): Promise<void> => {
  if (keys.length) await mediaCleanupQueue.add('delete-objects', { keys }, { jobId: `cleanup:${Date.now()}:${Math.random().toString(16).slice(2)}` });
};
