import argon2 from 'argon2';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { conflict, unauthorized, verificationTokenInvalid } from '../errors/app-error.js';
import type { AuthUser, Role } from '../core/types.js';
import { env } from '../config/env.js';
import { UserRepository, type UserRow } from '../repositories/user.repository.js';
import { verificationRepository } from '../repositories/verification.repository.js';
import { sendVerificationEmail } from './mailer.service.js';

interface TokenPayload extends JwtPayload {
  sub: string;
  role: Role;
  tv: number;
  typ: 'access' | 'refresh';
}

const users = new UserRepository();
const argonOptions = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

const publicUser = (user: UserRow) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  displayName: user.display_name,
  avatarKey: user.avatar_key,
  emailVerified: user.email_verified,
  createdAt: user.created_at,
});

export class AuthService {
  async register(input: { email: string; password: string; displayName: string }) {
    if (await users.findByEmail(input.email)) throw conflict('An account with that email already exists');
    const passwordHash = await argon2.hash(input.password, argonOptions);
    const user = await users.create({ email: input.email, passwordHash, displayName: input.displayName });
    // Fire-and-forget delivery: registration must not fail because the console/SMTP write does.
    void sendVerificationEmail(user.email, await verificationRepository.issue(user.id, 'signup'), user.display_name);
    return { user: publicUser(user), tokens: this.issueTokens(user) };
  }

  async login(input: { email: string; password: string }) {
    const user = await users.findByEmail(input.email);
    if (!user || !user.is_active || !(await argon2.verify(user.password_hash, input.password))) {
      throw unauthorized('Invalid email or password');
    }
    return { user: publicUser(user), tokens: this.issueTokens(user) };
  }

  async verifyEmail(token: string): Promise<void> {
    const consumed = await verificationRepository.consume(token);
    if (!consumed) throw verificationTokenInvalid();
    const verified = await users.markEmailVerified(consumed.userId);
    if (!verified) throw verificationTokenInvalid();
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await users.findById(userId);
    if (!user || !user.is_active) throw unauthorized('Account is unavailable');
    if (user.email_verified) return;
    await verificationRepository.deleteForUser(user.id);
    void sendVerificationEmail(user.email, await verificationRepository.issue(user.id, 'signup'), user.display_name);
  }

  async getProfile(id: string) {
    const user = await users.findById(id);
    if (!user || !user.is_active) throw unauthorized('Account is unavailable');
    return publicUser(user);
  }

  async updateProfile(id: string, input: { displayName?: string; avatarKey?: string | null }) {
    const user = await users.updateProfile(id, input);
    if (!user) throw unauthorized('Account is unavailable');
    return publicUser(user);
  }

  async logoutAll(id: string): Promise<void> {
    const version = await users.incrementTokenVersion(id);
    if (version === null) throw unauthorized('Account is unavailable');
  }

  async setRole(id: string, role: Role) {
    const user = await users.setRole(id, role);
    if (!user) throw unauthorized('Account is unavailable');
    await users.incrementTokenVersion(id);
    return publicUser(user);
  }

  async authenticate(accessToken: string): Promise<AuthUser> {
    const payload = this.verify(accessToken, 'access');
    const user = await users.findById(payload.sub);
    if (!user || !user.is_active || user.token_version !== payload.tv || user.role !== payload.role) {
      throw unauthorized('Session is no longer valid');
    }
    return { id: user.id, role: user.role, tokenVersion: user.token_version };
  }

  async refresh(refreshToken: string) {
    const payload = this.verify(refreshToken, 'refresh');
    const user = await users.findById(payload.sub);
    if (!user || !user.is_active || user.token_version !== payload.tv || user.role !== payload.role) {
      throw unauthorized('Session is no longer valid');
    }
    return this.issueTokens(user);
  }

  private issueTokens(user: UserRow) {
    const base = { sub: user.id, role: user.role, tv: user.token_version };
    const accessToken = jwt.sign(
      { ...base, typ: 'access' },
      env.jwt.accessSecret,
      { expiresIn: env.jwt.accessTtl as SignOptions['expiresIn'] },
    );
    const refreshToken = jwt.sign(
      { ...base, typ: 'refresh' },
      env.jwt.refreshSecret,
      { expiresIn: env.jwt.refreshTtl as SignOptions['expiresIn'] },
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: env.jwt.accessTtl };
  }

  private verify(token: string, expectedType: TokenPayload['typ']): TokenPayload {
    try {
      const secret = expectedType === 'access' ? env.jwt.accessSecret : env.jwt.refreshSecret;
      const payload = jwt.verify(token, secret);
      if (typeof payload === 'string' || payload.typ !== expectedType || !payload.sub || !payload.role || typeof payload.tv !== 'number') {
        throw new Error('Invalid token payload');
      }
      return payload as TokenPayload;
    } catch {
      throw unauthorized('Invalid or expired token');
    }
  }
}

export const authService = new AuthService();
