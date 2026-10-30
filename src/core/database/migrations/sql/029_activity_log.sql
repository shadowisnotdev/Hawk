-- 029_activity_log.sql
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  target_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_guild_created ON activity_log(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(guild_id, type);
