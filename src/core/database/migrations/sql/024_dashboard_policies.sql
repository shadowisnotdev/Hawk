-- 024_dashboard_policies.sql: Dashboard Role Policies, User Overrides, and Custom Profiles
CREATE TABLE IF NOT EXISTS role_policies (
  guild_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  profile_id VARCHAR(64) NOT NULL,
  member_count INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_role_policies_guild ON role_policies(guild_id);

CREATE TABLE IF NOT EXISTS user_overrides (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  module VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL,
  effect VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id, module, action)
);

CREATE INDEX IF NOT EXISTS idx_user_overrides_guild ON user_overrides(guild_id);

CREATE TABLE IF NOT EXISTS custom_profiles (
  guild_id VARCHAR(32) NOT NULL,
  profile_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  inherits_from VARCHAR(64),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_profiles_guild ON custom_profiles(guild_id);
