CREATE TABLE IF NOT EXISTS custom_role_aliases (
  guild_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  role_id TEXT NOT NULL,
  required_role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_custom_role_aliases_guild ON custom_role_aliases (guild_id);

