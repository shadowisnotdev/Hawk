-- ============================================================
-- 043_moderation_jail.sql
-- Quarantine jail system preserving previous role configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS jail_config (
  guild_id TEXT PRIMARY KEY,
  jail_role_id TEXT NOT NULL,
  jail_channel_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jailed_users (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  original_role_ids TEXT[] NOT NULL DEFAULT '{}',
  jailed_by TEXT NOT NULL,
  reason TEXT,
  jailed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, user_id)
);

