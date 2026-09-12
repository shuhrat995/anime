import type { Request } from 'express';
import { LogRepository, type LogCategory, type LogLevel } from '../repositories/log.repository.js';

const logs = new LogRepository();

export class LoggerService {
  async write(
    category: LogCategory,
    level: LogLevel,
    action: string,
    message: string,
    request?: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await logs.create({
        category,
        level,
        action,
        message,
        requestId: request?.context.requestId,
        userId: request?.auth?.id,
        route: request?.route?.path ? `${request.baseUrl}${request.route.path}` : request?.path,
        ip: request?.ip,
        userAgent: request?.get('user-agent'),
        metadata,
      });
    } catch (error) {
      process.stderr.write(
        `Logger persistence failure: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`,
      );
    }
  }

  audit(action: string, message: string, request?: Request, metadata?: Record<string, unknown>) {
    return this.write('audit', 'info', action, message, request, metadata);
  }

  security(action: string, message: string, request?: Request, metadata?: Record<string, unknown>) {
    return this.write('security', 'warn', action, message, request, metadata);
  }

  system(level: LogLevel, action: string, message: string, metadata?: Record<string, unknown>) {
    return this.write('system', level, action, message, undefined, metadata);
  }
}

export const logger = new LoggerService();
export { logs as logRepository };
