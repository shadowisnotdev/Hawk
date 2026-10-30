import { getDb } from '../pool.js';
import type { RestrictionRecord, RestrictionEffect } from '../../../types/permission.js';
import { TTLCache } from '../../utils/TTLCache.js';

const restrictionCache = new TTLCache<string, RestrictionRecord[]>(30_000); // guildId -> RestrictionRecord[]

export function invalidateRestrictionCache(guildId: string): void {
  restrictionCache.invalidate(guildId);
}

export async function getRestrictionsForGuild(guildId: string): Promise<RestrictionRecord[]> {
  const cached = restrictionCache.get(guildId);
  if (cached !== undefined) return cached;

  try {
    const db = getDb();
    const rows = await db`SELECT * FROM restrictions WHERE guild_id = ${guildId} ORDER BY created_at`;
    const mapped = rows.map(mapRestrictionRow);
    restrictionCache.set(guildId, mapped);
    return mapped;
  } catch {
    return [];
  }
}

export async function getRestrictions(
  guildId: string,
  commandName: string | null,
  moduleName: string,
): Promise<RestrictionRecord[]> {
  const all = await getRestrictionsForGuild(guildId);
  return all.filter((r) => {
    const matchCmd = r.commandName === commandName || r.commandName === null;
    const matchMod = r.moduleName === moduleName;
    return matchCmd && matchMod;
  });
}

export async function checkRestriction(
  guildId: string,
  commandName: string,
  moduleName: string,
  channelId: string,
  categoryId: string | null,
  userId: string,
  roleIds: string[],
): Promise<{ restricted: boolean; effect: RestrictionEffect | 'inherit' }> {
  const all = await getRestrictionsForGuild(guildId);

  const channelRestrictions = all.filter((r) => {
    if (r.locationType !== 'channel' || r.locationId !== channelId) return false;
    const matchCmd = r.commandName === commandName || r.commandName === null;
    const matchMod = r.moduleName === moduleName;
    return matchCmd && matchMod;
  });

  const channelResult = evaluateRestrictions(channelRestrictions, userId, roleIds);
  if (channelResult !== null) {
    return { restricted: channelResult === 'deny', effect: channelResult };
  }

  if (categoryId) {
    const categoryRestrictions = all.filter((r) => {
      if (r.locationType !== 'category' || r.locationId !== categoryId) return false;
      const matchCmd = r.commandName === commandName || r.commandName === null;
      const matchMod = r.moduleName === moduleName;
      return matchCmd && matchMod;
    });

    const categoryResult = evaluateRestrictions(categoryRestrictions, userId, roleIds);
    if (categoryResult !== null) {
      return { restricted: categoryResult === 'deny', effect: categoryResult };
    }
  }

  return { restricted: false, effect: 'inherit' };
}

export async function addRestriction(
  guildId: string,
  commandName: string | null,
  moduleName: string,
  targetType: 'user' | 'role' | null,
  targetId: string | null,
  locationType: 'channel' | 'category',
  locationId: string,
  effect: RestrictionEffect,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO restrictions (guild_id, command_name, module_name, target_type, target_id, location_type, location_id, effect)
    VALUES (${guildId}, ${commandName}, ${moduleName}, ${targetType}, ${targetId}, ${locationType}, ${locationId}, ${effect})
    ON CONFLICT (guild_id, command_name, module_name, target_type, target_id, location_type, location_id)
    DO UPDATE SET effect = ${effect}
  `;
  invalidateRestrictionCache(guildId);
}

export async function removeRestriction(
  guildId: string,
  commandName: string | null,
  moduleName: string,
  targetType: 'user' | 'role' | null,
  targetId: string | null,
  locationType: 'channel' | 'category',
  locationId: string,
): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM restrictions
    WHERE guild_id = ${guildId}
      AND command_name IS NOT DISTINCT FROM ${commandName}
      AND module_name = ${moduleName}
      AND target_type IS NOT DISTINCT FROM ${targetType}
      AND target_id IS NOT DISTINCT FROM ${targetId}
      AND location_type = ${locationType}
      AND location_id = ${locationId}
  `;
  invalidateRestrictionCache(guildId);
  return result.count > 0;
}

function evaluateRestrictions(
  rows: RestrictionRecord[],
  userId: string,
  roleIds: string[],
): RestrictionEffect | null {
  if (rows.length === 0) return null;

  for (const row of rows) {
    if (row.targetType === 'user' && row.targetId === userId) {
      return row.effect;
    }
  }

  for (const row of rows) {
    if (row.targetType === 'role' && row.targetId && roleIds.includes(row.targetId)) {
      return row.effect;
    }
  }

  for (const row of rows) {
    if (row.targetType === null) {
      return row.effect;
    }
  }

  return null;
}

function mapRestrictionRow(row: Record<string, unknown>): RestrictionRecord {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    commandName: row.command_name as string | null,
    moduleName: row.module_name as string,
    targetType: row.target_type as 'user' | 'role' | null,
    targetId: row.target_id as string | null,
    locationType: row.location_type as 'channel' | 'category',
    locationId: row.location_id as string,
    effect: row.effect as RestrictionEffect,
    createdAt: row.created_at as Date,
  };
}
