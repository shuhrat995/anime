CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('user', 'dubber', 'admin');
CREATE TYPE anime_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE episode_status AS ENUM ('draft', 'published', 'processing', 'failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  display_name varchar(100) NOT NULL,
  avatar_key text,
  token_version integer NOT NULL DEFAULT 0 CHECK (token_version >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  slug varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL UNIQUE,
  slug varchar(140) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  slug varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE anime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(250) NOT NULL,
  slug varchar(280) NOT NULL UNIQUE,
  synopsis text NOT NULL DEFAULT '',
  release_year smallint CHECK (release_year BETWEEN 1900 AND 2200),
  status anime_status NOT NULL DEFAULT 'draft',
  owner_id uuid NOT NULL REFERENCES users(id),
  studio_id uuid REFERENCES studios(id) ON DELETE SET NULL,
  cover_key text,
  banner_key text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anime_status_idx ON anime(status, published_at DESC);
CREATE INDEX anime_owner_idx ON anime(owner_id);
CREATE INDEX anime_search_idx ON anime USING gin (to_tsvector('simple', title || ' ' || synopsis));

CREATE TABLE anime_genres (
  anime_id uuid NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE RESTRICT,
  PRIMARY KEY (anime_id, genre_id)
);
CREATE TABLE anime_tags (
  anime_id uuid NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (anime_id, tag_id)
);

CREATE TABLE episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id uuid NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  title varchar(250) NOT NULL,
  description text NOT NULL DEFAULT '',
  status episode_status NOT NULL DEFAULT 'draft',
  package_prefix text,
  manifest jsonb,
  metadata jsonb,
  duration_seconds integer CHECK (duration_seconds >= 0),
  thumbnail_key text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anime_id, number)
);
CREATE INDEX episodes_anime_idx ON episodes(anime_id, number);

CREATE TABLE media_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  content_type varchar(150) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 char(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id uuid NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anime_id)
);
CREATE TABLE watch_history (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, episode_id)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER anime_updated_at BEFORE UPDATE ON anime FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER episodes_updated_at BEFORE UPDATE ON episodes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
