-- ============================================================
-- 042_conditional_roles.sql
-- Role connection engine for automatic assignment based on conditions
-- ============================================================

CREATE TABLE IF NOT EXISTS role_connections (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  main_role_id TEXT NOT NULL,
  conditional_role_ids TEXT[] NOT NULL DEFAULT '{}',
  require_all BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, main_role_id)
);

