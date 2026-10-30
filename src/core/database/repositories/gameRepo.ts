import { getDb } from '../pool.js';
import type { GamePingConfig, CreateGamePingInput, UpdateGamePingInput } from '../../../types/gaming.js';

export async function createGamePing(input: CreateGamePingInput): Promise<GamePingConfig> {
  const db = getDb();
  const lowerId = input.identifier.toLowerCase();
  const cooldown = input.cooldownSeconds ?? 300;

  const rows = await db`
    INSERT INTO game_pings (guild_id, identifier, game_name, role_id, vc_id, cooldown_seconds)
    VALUES (${input.guildId}, ${lowerId}, ${input.gameName}, ${input.roleId}, ${input.vcId}, ${cooldown})
    RETURNING id, guild_id, identifier, game_name, role_id, vc_id, cooldown_seconds, created_at, updated_at
  `;

  return mapPingRow(rows[0]);
}

export async function getGamePing(guildId: string, identifier: string): Promise<GamePingConfig | null> {
  const db = getDb();
  const lowerId = identifier.toLowerCase();

  const rows = await db`
    SELECT * FROM game_pings
    WHERE guild_id = ${guildId} AND identifier = ${lowerId}
  `;

  if (rows.length === 0) return null;
  return mapPingRow(rows[0]);
}

export async function updateGamePing(
  guildId: string,
  identifier: string,
  updates: UpdateGamePingInput,
): Promise<GamePingConfig | null> {
  const db = getDb();
  const lowerId = identifier.toLowerCase();

  const existing = await getGamePing(guildId, lowerId);
  if (!existing) return null;

  const newIdentifier = updates.newIdentifier ? updates.newIdentifier.toLowerCase() : existing.identifier;
  const newGameName = updates.gameName ?? existing.gameName;
  const newRoleId = updates.roleId ?? existing.roleId;
  const newVcId = updates.vcId ?? existing.vcId;
  const newCooldown = updates.cooldownSeconds ?? existing.cooldownSeconds;

  const rows = await db`
    UPDATE game_pings
    SET identifier = ${newIdentifier},
        game_name = ${newGameName},
        role_id = ${newRoleId},
        vc_id = ${newVcId},
        cooldown_seconds = ${newCooldown},
        updated_at = NOW()
    WHERE id = ${existing.id}
    RETURNING id, guild_id, identifier, game_name, role_id, vc_id, cooldown_seconds, created_at, updated_at
  `;

  if (rows.length === 0) return null;
  return mapPingRow(rows[0]);
}

export async function deleteGamePing(guildId: string, identifier: string): Promise<boolean> {
  const db = getDb();
  const lowerId = identifier.toLowerCase();

  const result = await db`
    DELETE FROM game_pings
    WHERE guild_id = ${guildId} AND identifier = ${lowerId}
  `;

  return result.count > 0;
}

export async function listGamePings(guildId: string): Promise<GamePingConfig[]> {
  const db = getDb();

  let rows = await db`
    SELECT * FROM game_pings
    WHERE guild_id = ${guildId}
    ORDER BY identifier ASC
  `;

  if (rows.length === 0) {
    try {
      const oldRows = await db`
        SELECT g.id, g.guild_id, g.identifier, g.name as game_name, g.role_id, COALESCE(v.vc_id, '') as vc_id, COALESCE(v.cooldown_seconds, 300) as cooldown_seconds, g.created_at, g.updated_at
        FROM games g
        LEFT JOIN game_vcs v ON v.game_id = g.id
        WHERE g.guild_id = ${guildId}
      `;
      if (oldRows.length > 0) {
        rows = oldRows;
      }
    } catch {
      // Old legacy table does not exist
    }
  }

  return rows.map(mapPingRow);
}

function mapPingRow(row: Record<string, unknown>): GamePingConfig {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    identifier: row.identifier as string,
    gameName: row.game_name as string,
    roleId: row.role_id as string,
    vcId: row.vc_id as string,
    cooldownSeconds: row.cooldown_seconds as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

// Backward compatibility alias functions
export const getGame = getGamePing;
export const deleteGame = deleteGamePing;

const testChannelCache = new Map<string, string | null>(); // guildId -> channelId or null

export async function setGameTestChannel(guildId: string, channelId: string | null): Promise<void> {
  testChannelCache.set(guildId, channelId);
  try {
    const db = getDb();
    if (channelId) {
      await db`
        INSERT INTO game_guild_configs (guild_id, test_channel_id, updated_at)
        VALUES (${guildId}, ${channelId}, NOW())
        ON CONFLICT (guild_id)
        DO UPDATE SET test_channel_id = ${channelId}, updated_at = NOW()
      `;
    } else {
      await db`
        DELETE FROM game_guild_configs WHERE guild_id = ${guildId}
      `;
    }
  } catch {
    // Graceful fallback
  }
}

export async function getGameTestChannel(guildId: string): Promise<string | null> {
  if (testChannelCache.has(guildId)) {
    return testChannelCache.get(guildId) ?? null;
  }

  try {
    const db = getDb();
    const rows = await db`SELECT test_channel_id FROM game_guild_configs WHERE guild_id = ${guildId}`;
    if (rows.length === 0 || !rows[0].test_channel_id) {
      testChannelCache.set(guildId, null);
      return null;
    }
    const channelId = rows[0].test_channel_id as string;
    testChannelCache.set(guildId, channelId);
    return channelId;
  } catch {
    return null;
  }
}
