import { Client } from 'pg';

const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres' });
await client.connect();
const existing = await client.query(
  "SELECT datname FROM pg_database WHERE datname IN ('anime_platform', 'anime_logs')",
);
const names = existing.rows.map((row) => row.datname);
if (!names.includes('anime_platform')) await client.query('CREATE DATABASE anime_platform');
if (!names.includes('anime_logs')) await client.query('CREATE DATABASE anime_logs');
console.log('DB holati:', names.length === 2 ? 'allaqachon bor' : `yaratildi: ${names.join(', ')}`);
await client.end();
