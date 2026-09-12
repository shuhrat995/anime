import type { Response } from 'express';
import type { ApiSuccess } from '../core/types.js';

export const success = <T>(res: Response, data: T, message = 'Success', status = 200): Response => {
  const body: ApiSuccess<T> = { success: true, data, message };
  return res.status(status).json(body);
};
