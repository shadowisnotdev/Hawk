-- Confession module schema

CREATE TABLE IF NOT EXISTS confession_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS confession_records (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_confession_records_lookup ON confession_records(guild_id);
