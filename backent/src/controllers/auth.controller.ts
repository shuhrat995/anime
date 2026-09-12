import type { RequestHandler } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { success } from '../utils/response.js';
import { authService } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';

export const register: RequestHandler = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  await logger.audit('auth.register', 'Account registered', req, { targetUserId: result.user.id });
  success(res, result, 'Registration successful', 201);
});

export const login: RequestHandler = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  await logger.audit('auth.login', 'Session created', req, { targetUserId: result.user.id });
  success(res, result, 'Login successful');
});

export const verifyEmail: RequestHandler = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body.token);
  await logger.audit('auth.email.verified', 'Email verified', req);
  success(res, { verified: true }, 'Email tasdiqlandi');
});

export const resendVerification: RequestHandler = asyncHandler(async (req, res) => {
  await authService.resendVerificationEmail(req.auth!.id);
  await logger.audit('auth.email.resent', 'Verification email re-sent', req);
  success(res, { sent: true }, 'Tasdiqlash havolasi qayta yuborildi');
});

export const refresh: RequestHandler = asyncHandler(async (req, res) => {
  success(res, await authService.refresh(req.body.refreshToken), 'Token refreshed');
});

export const logout: RequestHandler = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.auth!.id);
  await logger.audit('auth.logout', 'All active sessions invalidated', req);
  success(res, null, 'Logged out');
});

export const me: RequestHandler = asyncHandler(async (req, res) => {
  success(res, await authService.getProfile(req.auth!.id));
});

export const updateMe: RequestHandler = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.auth!.id, req.body);
  await logger.audit('user.profile.update', 'Profile updated', req);
  success(res, user, 'Profile updated');
});
