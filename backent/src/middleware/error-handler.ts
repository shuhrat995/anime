import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { logger } from '../services/logger.service.js';

export const notFoundHandler: RequestHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  console.error('🔥 REAL ERROR:', error);
  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');

  void logger.write(
    appError.statusCode >= 500 ? 'system' : 'security',
    appError.statusCode >= 500 ? 'error' : 'warn',
    'request.failed',
    error instanceof Error ? error.message : String(error),
    req,
    env.nodeEnv === 'production' ? undefined : { stack: error instanceof Error ? error.stack : undefined },
  );
  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
      ...(env.nodeEnv === 'production' || !(error instanceof Error) ? {} : { request_id: req.context?.requestId }),
    },
  });
};
