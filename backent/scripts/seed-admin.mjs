import { Client } from 'pg';

// Promotes the seeded admin account and adds starter catalog data so the UI has something to show.
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/anime_platform' });
await client.connect();

const email = 'admin@zenith.uz';
const user = await client.query('SELECT id FROM users WHERE email = $1', [email]);
if (user.rowCount) {
  await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.rows[0].id]);
  console.log('Admin rol berildi:', email);
} else {
  console.log('Foydalanuvchi topilmadi, avval royxatdan otish kerak');
}

const genres = [
  ['Action', 'action'], ['Adventure', 'adventure'], ['Fantasy', 'fantasy'],
  ['Romance', 'romance'], ['Sci-Fi', 'sci-fi'], ['Drama', 'drama'],
  ['Comedy', 'comedy'], ['Mystery', 'mystery'],
];
for (const [name, slug] of genres) {
  await client.query('INSERT INTO genres(name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING', [name, slug]);
}
const genreCount = await client.query('SELECT count(*)::int AS n FROM genres');
console.log('Janrlar:', genreCount.rows[0].n);

await client.end();
