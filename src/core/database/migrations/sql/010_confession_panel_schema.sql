-- Add panel_message_id to confession_configs
ALTER TABLE confession_configs ADD COLUMN IF NOT EXISTS panel_message_id TEXT;
