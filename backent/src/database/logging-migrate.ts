import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { logDb } from './pool.js';

const migrationDirectory = path.join(import.meta.dirname, 'logging-migrations');

const migrate = async (): Promise<void> => {
  await logDb.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    executed_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const name of files) {
    const existing = await logDb.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (existing.rowCount) continue;
    const client = await logDb.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(path.join(migrationDirectory, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      process.stdout.write(`Applied logging ${name}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

migrate().then(() => logDb.end()).catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await logDb.end();
  process.exitCode = 1;
});
