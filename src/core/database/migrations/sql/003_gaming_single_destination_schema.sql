-- Gaming single-destination ping configurations migration

CREATE TABLE IF NOT EXISTS game_pings (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  identifier TEXT NOT NULL,
  game_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  vc_id TEXT NOT NULL,
  cooldown_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(guild_id, identifier)
);

CREATE INDEX IF NOT EXISTS idx_game_pings_lookup ON game_pings(guild_id, identifier);

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'games') THEN
    INSERT INTO game_pings (guild_id, identifier, game_name, role_id, vc_id, cooldown_seconds)
    SELECT
      g.guild_id,
      CASE
        WHEN (SELECT COUNT(*) FROM game_vcs v WHERE v.game_id = g.id) = 1 THEN g.identifier
        ELSE g.identifier || '_' || ROW_NUMBER() OVER (PARTITION BY g.id ORDER BY v.id)
      END,
      g.name,
      g.role_id,
      v.vc_id,
      v.cooldown_seconds
    FROM games g
    JOIN game_vcs v ON v.game_id = g.id
    ON CONFLICT (guild_id, identifier) DO NOTHING;

    DROP TABLE IF EXISTS game_vcs;
    DROP TABLE IF EXISTS games;
  END IF;
END $$;
