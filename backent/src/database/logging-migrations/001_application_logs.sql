CREATE TABLE application_logs (
  id bigserial PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  category varchar(16) NOT NULL CHECK (category IN ('audit', 'security', 'system')),
  level varchar(8) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  request_id uuid,
  user_id uuid,
  route text,
  ip inet,
  user_agent text,
  action varchar(120) NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX application_logs_timestamp_idx ON application_logs(timestamp DESC);
CREATE INDEX application_logs_category_idx ON application_logs(category, timestamp DESC);
CREATE INDEX application_logs_user_idx ON application_logs(user_id, timestamp DESC);
