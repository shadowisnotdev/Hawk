CREATE TABLE IF NOT EXISTS suggestion_configs (
  guild_id TEXT PRIMARY KEY, channel_id TEXT, panel_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS confession_configs (
  guild_id TEXT PRIMARY KEY, channel_id TEXT, log_channel_id TEXT, panel_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE suggestion_configs ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE confession_configs ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE suggestion_configs ADD COLUMN IF NOT EXISTS panel_message_id TEXT;
ALTER TABLE confession_configs ADD COLUMN IF NOT EXISTS panel_message_id TEXT;
ALTER TABLE confession_configs ADD COLUMN IF NOT EXISTS log_channel_id TEXT;
CREATE TABLE IF NOT EXISTS guild_audit_logs (
  id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL,
  action TEXT NOT NULL, module TEXT NOT NULL, target TEXT, previous_value TEXT, new_value TEXT,
  severity TEXT NOT NULL, source TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guild_audit_created ON guild_audit_logs(guild_id, created_at DESC);
ALTER TABLE economy_config ADD COLUMN IF NOT EXISTS auto_cleanup BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS inventory_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS usable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS sellable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT -1;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS role_required TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS role_given TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS role_removed TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS reply_message TEXT;
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS requirements_json JSONB DEFAULT '[]';
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS actions_json JSONB DEFAULT '[]';
ALTER TABLE store_items ADD COLUMN IF NOT EXISTS icon_url TEXT;
