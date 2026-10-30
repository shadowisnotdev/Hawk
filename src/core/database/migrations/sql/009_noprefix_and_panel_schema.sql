-- Add panel_message_id to suggestion_configs
ALTER TABLE suggestion_configs ADD COLUMN IF NOT EXISTS panel_message_id TEXT;

-- No-prefix per user and guild table
CREATE TABLE IF NOT EXISTS no_prefix_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
