-- ============================================================
-- 044_giveaways.sql
-- Advanced giveaways with active and ended state transitions
-- ============================================================

CREATE TABLE IF NOT EXISTS giveaways (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winner_count INTEGER NOT NULL DEFAULT 1,
  required_role_id TEXT,
  ends_at TIMESTAMPTZ NOT NULL,
  ended BOOLEAN NOT NULL DEFAULT FALSE,
  winners TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id SERIAL PRIMARY KEY,
  giveaway_id INTEGER NOT NULL REFERENCES giveaways(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(giveaway_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(ended, ends_at);

