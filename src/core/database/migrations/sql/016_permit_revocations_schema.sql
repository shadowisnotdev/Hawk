-- Audit log for permit revocations
CREATE TABLE IF NOT EXISTS permit_revocations (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'role')),
  target_id TEXT NOT NULL,
  command_name TEXT,
  module_name TEXT,
  revoked_by_id TEXT NOT NULL,
  revoked_by_name TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permit_revocations_lookup
  ON permit_revocations(guild_id, target_id, command_name, module_name);
