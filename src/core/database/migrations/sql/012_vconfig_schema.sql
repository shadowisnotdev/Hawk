-- Voice command configuration rules table
CREATE TABLE IF NOT EXISTS vconfig_rules (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('wl', 'bl')),
  channel_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, command_name, role_id, mode)
);
CREATE INDEX IF NOT EXISTS idx_vconfig_lookup ON vconfig_rules(guild_id, command_name, role_id);
