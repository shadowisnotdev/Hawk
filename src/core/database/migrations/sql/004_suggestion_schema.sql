-- Suggestion module schema

CREATE TABLE IF NOT EXISTS suggestion_configs (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suggestion_counters (
  guild_id TEXT PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suggestions (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  number INT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'considered', 'denied')),
  staff_id TEXT,
  staff_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, number)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_lookup ON suggestions(guild_id, number);
CREATE INDEX IF NOT EXISTS idx_suggestions_msg ON suggestions(guild_id, message_id);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  suggestion_id INT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(suggestion_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_lookup ON suggestion_votes(suggestion_id, user_id);

CREATE TABLE IF NOT EXISTS suggestion_blacklists (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_blacklists_lookup ON suggestion_blacklists(guild_id, user_id);
