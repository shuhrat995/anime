import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import Joi from 'joi';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openapi } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { metricsMiddleware } from './monitoring/metrics.js';
import { requestContext } from './middleware/request-context.js';
import { rateLimit } from './middleware/rate-limit.js';
import { validate } from './middleware/validate.js';
import { createApiRouter } from './routes/index.js';
import * as health from './controllers/health.controller.js';
import { authenticate } from './middleware/authenticate.js';
import { authorize } from './middleware/authorize.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestContext);
  app.use(metricsMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      const allowAll = env.corsOrigins.length === 0 || env.corsOrigins.includes('*');
      if (!origin || allowAll || env.corsOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['x-request-id', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'],
  }));
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(validate({ headers: Joi.object({ authorization: Joi.string().pattern(/^Bearer\s+\S+$/i) }) }));

  app.get('/health', health.health);
  app.get('/health/database', health.databaseHealth);
  app.get('/health/redis', health.redisHealth);
  app.get('/health/storage', health.storageHealth);
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);
  app.get('/metrics', authenticate, authorize('admin'), health.metrics);
  app.get('/admin/queues', authenticate, authorize('admin'), health.queueStatus);
  app.get('/docs/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true, customSiteTitle: 'Anime Platform API Docs' }));
  app.use(env.apiPrefix, rateLimit('api', 300, 60), createApiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
