import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env.js';

const buildPool = (connectionString: string) => {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Enable TLS only when the connection string explicitly asks for it (e.g. a managed database with
    // ?sslmode=require). The internal Docker Postgres serves plaintext on a private network, so default off.
    ssl: /sslmode=(require|verify-ca|verify-full)/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  // A background/idle client failure emits a pool-level 'error' event; with no listener it would
  // crash the whole process whenever the database blips. Keep the API alive — requests then fail
  // individually with 503-style errors instead of taking the service down.
  pool.on('error', (error) => {
    process.stderr.write(`Database pool error: ${error instanceof Error ? error.message : String(error)}\n`);
  });
  return pool;
};

export const db = buildPool(env.databaseUrl);
export const logDb = buildPool(env.logDatabaseUrl);

export const query = <T extends QueryResultRow>(text: string, values: unknown[] = []) =>
  db.query<T>(text, values);

export const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeDatabases = async (): Promise<void> => {
  await Promise.all([db.end(), logDb.end()]);
};
