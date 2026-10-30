CREATE TABLE IF NOT EXISTS custom_commands (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  flow_json JSONB NOT NULL,
  script_text TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_ms INTEGER NOT NULL DEFAULT 1000 CHECK (cooldown_ms BETWEEN 1000 AND 86400000),
  required_roles TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, name), UNIQUE(guild_id, trigger)
);
CREATE INDEX IF NOT EXISTS idx_custom_commands_guild ON custom_commands(guild_id, enabled);
CREATE INDEX IF NOT EXISTS idx_activity_log_guild_created ON activity_log(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economy_balances_guild_net ON economy_balances(guild_id, (cash + bank) DESC);
CREATE INDEX IF NOT EXISTS idx_economy_transactions_guild_created ON economy_transactions(guild_id, created_at DESC);
-- A disabled community destination is represented by NULL, preserving records.
ALTER TABLE suggestion_configs ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE confession_configs ALTER COLUMN channel_id DROP NOT NULL;
