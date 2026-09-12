import { describe, expect, it } from 'vitest';

describe('environment config', () => {
  it('loads with the committed .env and exposes a usable port', async () => {
    const { env } = await import('../src/config/env.js');
    expect(env.port).toBeGreaterThan(0);
    expect(env.port).toBeLessThanOrEqual(65_535);
    expect(env.apiPrefix).toBe('/api/v1');
    expect(env.databaseUrl).toMatch(/^postgres(ql)?:\/\//);
    expect(env.logDatabaseUrl).toMatch(/^postgres(ql)?:\/\//);
    expect(env.redisUrl).toMatch(/^redis(s)?:\/\//);
    expect(env.jwt.accessSecret.length).toBeGreaterThanOrEqual(64);
    expect(env.jwt.refreshSecret.length).toBeGreaterThanOrEqual(64);
    expect(['minio', 's3']).toContain(env.storage.provider);
  });
});
