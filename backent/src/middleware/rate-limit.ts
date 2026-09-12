import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { redis } from '../redis/client.js';

export const rateLimit = (name: string, limit: number, windowSeconds: number): RequestHandler =>
  async (req, res, next) => {
    try {
      const key = `ratelimit:${name}:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      const ttl = await redis.ttl(key);
      res.setHeader('RateLimit-Limit', String(limit));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
      if (ttl >= 0) res.setHeader('RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + ttl));
      if (count > limit) return next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
      next();
    } catch (error) {
      next(error);
    }
  };
