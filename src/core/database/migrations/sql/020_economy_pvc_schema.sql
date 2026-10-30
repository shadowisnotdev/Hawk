-- ============================================================
-- Economy & PVC Schema Migration
-- ============================================================

-- Economy configuration per guild
CREATE TABLE IF NOT EXISTS economy_config (
  guild_id            TEXT PRIMARY KEY,
  currency_symbol     TEXT NOT NULL DEFAULT '$',
  bot_commander_role_id TEXT,
  start_balance       BIGINT NOT NULL DEFAULT 0,
  min_bet             BIGINT NOT NULL DEFAULT 10,
  max_bet             BIGINT NOT NULL DEFAULT 50000,
  blackjack_decks     INT NOT NULL DEFAULT 6,
  passive_income      BOOLEAN NOT NULL DEFAULT FALSE,
  passive_amount      BIGINT NOT NULL DEFAULT 1,
  income_reset        TEXT NOT NULL DEFAULT '24h',
  work_cooldown       INT NOT NULL DEFAULT 30,
  slut_cooldown       INT NOT NULL DEFAULT 45,
  crime_cooldown      INT NOT NULL DEFAULT 60,
  rob_cooldown        INT NOT NULL DEFAULT 120,
  audit_channel_id    TEXT,
  pvc_hourly_rate     BIGINT NOT NULL DEFAULT 100,
  pvc_jtc_channel_id  TEXT,
  pvc_category_id     TEXT,
  pvc_command_channel_id TEXT,
  pvc_panel_channel_id   TEXT,
  pvc_master_panel_msg_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Economy balances per guild member
CREATE TABLE IF NOT EXISTS economy_balances (
  guild_id      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  cash          BIGINT NOT NULL DEFAULT 0,
  bank          BIGINT NOT NULL DEFAULT 0,
  bank_capacity BIGINT NOT NULL DEFAULT 10000,
  work_last     TIMESTAMPTZ,
  slut_last     TIMESTAMPTZ,
  crime_last    TIMESTAMPTZ,
  rob_last      TIMESTAMPTZ,
  passive_last  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_economy_balances_cash
  ON economy_balances (guild_id, cash DESC);
CREATE INDEX IF NOT EXISTS idx_economy_balances_bank
  ON economy_balances (guild_id, bank DESC);
CREATE INDEX IF NOT EXISTS idx_economy_balances_net
  ON economy_balances (guild_id, (cash + bank) DESC);

-- Income roles per guild
CREATE TABLE IF NOT EXISTS income_roles (
  guild_id      TEXT NOT NULL,
  role_id       TEXT NOT NULL,
  income_amount BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, role_id)
);

-- Store items per guild
CREATE TABLE IF NOT EXISTS store_items (
  item_id           SERIAL PRIMARY KEY,
  guild_id          TEXT NOT NULL,
  name              TEXT NOT NULL,
  price             BIGINT NOT NULL DEFAULT 0,
  description       TEXT NOT NULL DEFAULT '',
  inventory_role_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_items_guild_name
  ON store_items (guild_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_store_items_guild
  ON store_items (guild_id);

-- User inventory
CREATE TABLE IF NOT EXISTS user_inventory (
  inventory_id SERIAL PRIMARY KEY,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  item_id      INT NOT NULL REFERENCES store_items(item_id) ON DELETE CASCADE,
  quantity     INT NOT NULL DEFAULT 1,
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user
  ON user_inventory (guild_id, user_id);

-- PVC Sessions
CREATE TABLE IF NOT EXISTS pvc_sessions (
  channel_id       TEXT PRIMARY KEY,
  guild_id         TEXT NOT NULL,
  owner_id         TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  auto_pay_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  user_limit       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvc_sessions_guild_owner
  ON pvc_sessions (guild_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_pvc_sessions_expires
  ON pvc_sessions (expires_at);

-- PVC Access control per channel
CREATE TABLE IF NOT EXISTS pvc_access (
  channel_id  TEXT NOT NULL REFERENCES pvc_sessions(channel_id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('USER', 'ROLE')),
  access      TEXT NOT NULL CHECK (access IN ('ALLOW', 'DENY')) DEFAULT 'ALLOW',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, target_id)
);

-- Economy audit log
CREATE TABLE IF NOT EXISTS economy_audit_log (
  id          SERIAL PRIMARY KEY,
  guild_id    TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  target_id   TEXT,
  action      TEXT NOT NULL,
  amount      BIGINT,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economy_audit_guild
  ON economy_audit_log (guild_id, created_at DESC);
