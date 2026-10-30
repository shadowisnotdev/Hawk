-- 025_welcome_enabled_column.sql: Add greet_enabled and leave_enabled flags to welcome_configs
ALTER TABLE welcome_configs
  ADD COLUMN IF NOT EXISTS greet_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leave_enabled BOOLEAN NOT NULL DEFAULT false;
