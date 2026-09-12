import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from './pool.js';

const migrationDirectory = path.join(import.meta.dirname, 'migrations');

const migrate = async (): Promise<void> => {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    executed_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const name of files) {
    const executed = await db.query<{ name: string }>('SELECT name FROM schema_migrations WHERE name = $1', [name]);
    if (executed.rowCount) continue;
    const sql = await readFile(path.join(migrationDirectory, name), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

migrate().then(() => db.end()).catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await db.end();
  process.exitCode = 1;
});
