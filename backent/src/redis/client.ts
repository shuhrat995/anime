import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}