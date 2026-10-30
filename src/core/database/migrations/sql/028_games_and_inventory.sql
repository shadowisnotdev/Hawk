-- ============================================================
-- 028_games_and_inventory.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS game_cooldowns (
  guild_id TEXT NOT NULL,
  game_name TEXT NOT NULL,
  cooldown_seconds INT NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, game_name)
);

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
