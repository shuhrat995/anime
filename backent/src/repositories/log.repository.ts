import { logDb } from '../database/pool.js';

export type LogCategory = 'audit' | 'security' | 'system';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  category: LogCategory;
  level: LogLevel;
  requestId?: string;
  userId?: string;
  route?: string;
  ip?: string;
  userAgent?: string;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export class LogRepository {
  async create(record: LogRecord): Promise<void> {
    await logDb.query(
      `INSERT INTO application_logs
       (category, level, request_id, user_id, route, ip, user_agent, action, message, metadata)
       VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6::inet, $7, $8, $9, $10::jsonb)`,
      [
        record.category,
        record.level,
        record.requestId ?? null,
        record.userId ?? null,
        record.route ?? null,
        record.ip ?? null,
        record.userAgent ?? null,
        record.action,
        record.message,
        JSON.stringify(record.metadata ?? {}),
      ],
    );
  }

  async list(filters: { category?: LogCategory; userId?: string; limit: number; offset: number }) {
    const result = await logDb.query<{
      id: number; timestamp: Date; category: LogCategory; level: LogLevel; request_id: string | null;
      user_id: string | null; route: string | null; ip: string | null; user_agent: string | null;
      action: string; message: string; metadata: Record<string, unknown>;
    }>(
      `SELECT id, timestamp, category, level, request_id, user_id, route, ip::text, user_agent, action, message, metadata
       FROM application_logs
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::uuid IS NULL OR user_id = $2)
       ORDER BY timestamp DESC LIMIT $3 OFFSET $4`,
      [filters.category ?? null, filters.userId ?? null, filters.limit, filters.offset],
    );
    return result.rows;
  }
}
