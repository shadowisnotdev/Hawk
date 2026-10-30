-- ============================================================
-- 041_ticket_system.sql
-- Ticket panels configuration and active/closed ticket tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_panels (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thumbnail_url TEXT,
  button_label TEXT NOT NULL DEFAULT 'Create Ticket',
  staff_role_id TEXT NOT NULL,
  category_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, name)
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  panel_id INTEGER REFERENCES ticket_panels(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  target_user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  closed_by TEXT,
  close_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);

