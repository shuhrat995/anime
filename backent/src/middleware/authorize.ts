import type { RequestHandler } from 'express';
import { forbidden } from '../errors/app-error.js';
import type { Role } from '../core/types.js';

export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) return next(forbidden());
  next();
};
