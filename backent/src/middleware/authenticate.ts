import type { RequestHandler } from 'express';
import { unauthorized } from '../errors/app-error.js';
import { authService } from '../services/auth.service.js';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const user = await authService.authenticate(authorization.slice(7));
    req.auth = user;
    req.context.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticateOptional: RequestHandler = async (req, _res, next) => {
  const authorization = req.get('authorization');
  if (!authorization) return next();
  if (!authorization.startsWith('Bearer ')) return next(unauthorized());
  try {
    const user = await authService.authenticate(authorization.slice(7));
    req.auth = user;
    req.context.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
