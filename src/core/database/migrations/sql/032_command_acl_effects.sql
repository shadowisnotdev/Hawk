ALTER TABLE permits ADD COLUMN IF NOT EXISTS effect TEXT NOT NULL DEFAULT 'ALLOW' CHECK (effect IN ('ALLOW', 'DENY'));
CREATE INDEX IF NOT EXISTS idx_permits_guild_command ON permits (guild_id, command_name);
