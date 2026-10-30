-- Media module schema

CREATE TABLE IF NOT EXISTS media_channels (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS media_guild_configs (
  guild_id TEXT PRIMARY KEY,
  auto_thread BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
