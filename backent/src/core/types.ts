import type { Request } from 'express';

export const ROLES = ['user', 'dubber', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthUser {
  id: string;
  role: Role;
  tokenVersion: number;
}

export interface RequestContext {
  requestId: string;
  route?: string;
  user?: AuthUser;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
      auth?: AuthUser;
    }
  }
}

export type ApiSuccess<T> = { success: true; data: T; message: string };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

export type AuthenticatedRequest = Request & { auth: AuthUser };
