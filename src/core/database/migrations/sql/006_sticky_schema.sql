-- Sticky module schema

CREATE TABLE IF NOT EXISTS sticky_messages (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_sticky_messages_lookup ON sticky_messages(guild_id, channel_id);
