import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (req, res, next) => {
  const requestedId = req.get('x-request-id');
  const requestId = requestedId && /^[a-zA-Z0-9-]{8,128}$/.test(requestedId) ? requestedId : randomUUID();
  req.context = { requestId };
  res.setHeader('x-request-id', requestId);
  next();
};
