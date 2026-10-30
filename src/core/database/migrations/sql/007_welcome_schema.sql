-- Welcome module schema

CREATE TABLE IF NOT EXISTS welcome_configs (
  guild_id TEXT PRIMARY KEY,
  greet_channel_id TEXT,
  greet_payload TEXT,
  leave_channel_id TEXT,
  leave_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
