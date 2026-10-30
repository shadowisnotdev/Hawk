-- ============================================================
-- 027_economy_transactions_pvc_defaults.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS economy_transactions (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount BIGINT NOT NULL,
  source TEXT NOT NULL,
  target_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economy_transactions_guild
  ON economy_transactions (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_economy_transactions_user
  ON economy_transactions (guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pvc_user_defaults (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name_template TEXT NOT NULL DEFAULT '{username}''s Channel',
  user_limit INT NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  auto_pay_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);
