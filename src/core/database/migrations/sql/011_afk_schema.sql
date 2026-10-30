-- AFK user status table
CREATE TABLE IF NOT EXISTS afk_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'AFK',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_afk_lookup ON afk_users(guild_id, user_id);
