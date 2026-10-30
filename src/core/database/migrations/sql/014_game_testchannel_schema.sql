CREATE TABLE IF NOT EXISTS game_guild_configs (
  guild_id TEXT PRIMARY KEY,
  test_channel_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
