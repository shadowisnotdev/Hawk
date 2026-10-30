-- Gaming module schema: games and per-VC destination configurations

CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  identifier TEXT NOT NULL,
  name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, identifier)
);

CREATE INDEX IF NOT EXISTS idx_games_lookup ON games(guild_id, identifier);

CREATE TABLE IF NOT EXISTS game_vcs (
  id SERIAL PRIMARY KEY,
  game_id INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  vc_id TEXT NOT NULL,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(game_id, vc_id)
);
