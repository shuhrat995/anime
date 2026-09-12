import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { RequestHandler } from 'express';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'anime_platform_' });

const requestDuration = new Histogram({
  name: 'anime_platform_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});
const requestCount = new Counter({
  name: 'anime_platform_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    requestDuration.observe(labels, seconds);
    requestCount.inc(labels);
  });
  next();
};
