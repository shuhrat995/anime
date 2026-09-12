CREATE TYPE anime_visibility AS ENUM ('public', 'restricted');

ALTER TABLE anime ADD COLUMN visibility anime_visibility NOT NULL DEFAULT 'public';

CREATE TABLE anime_access (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id uuid NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);
CREATE INDEX anime_access_anime_idx ON anime_access(anime_id);
