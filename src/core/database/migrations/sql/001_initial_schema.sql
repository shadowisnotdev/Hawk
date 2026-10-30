-- Guild configuration
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Custom permits
CREATE TABLE IF NOT EXISTS permits (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'role')),
  target_id TEXT NOT NULL,
  command_name TEXT,
  module_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, target_type, target_id, command_name, module_name)
);
CREATE INDEX IF NOT EXISTS idx_permits_lookup
  ON permits(guild_id, command_name, module_name);

-- Channel/category restrictions
CREATE TABLE IF NOT EXISTS restrictions (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  command_name TEXT,
  module_name TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('user', 'role')),
  target_id TEXT,
  location_type TEXT NOT NULL CHECK (location_type IN ('channel', 'category')),
  location_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')) DEFAULT 'allow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, command_name, module_name, target_type, target_id, location_type, location_id)
);
CREATE INDEX IF NOT EXISTS idx_restrictions_lookup
  ON restrictions(guild_id, command_name, module_name, location_id);

-- Ignore system
CREATE TABLE IF NOT EXISTS ignored_entities (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'role', 'channel', 'category')),
  entity_id TEXT NOT NULL,
  scope_type TEXT CHECK (scope_type IN ('command', 'module')),
  scope_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, entity_type, entity_id, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_ignored_lookup
  ON ignored_entities(guild_id, entity_type, entity_id);
