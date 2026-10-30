import { getDb } from '../pool.js';
import { TTLCache } from '../../utils/TTLCache.js';

export interface VConfigRule {
  id: number;
  guildId: string;
  commandName: string;
  roleId: string;
  mode: 'wl' | 'bl';
  channelIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const vconfigCache = new TTLCache<string, VConfigRule[]>(300_000); // guildId -> VConfigRule[]

export function invalidateVConfigCache(guildId: string): void {
  vconfigCache.invalidate(guildId);
}

export async function getVConfigRulesForGuild(guildId: string): Promise<VConfigRule[]> {
  const cached = vconfigCache.get(guildId);
  if (cached !== undefined) return cached;

  try {
    const db = getDb();
    const rows = await db`
      SELECT * FROM vconfig_rules
      WHERE guild_id = ${guildId}
      ORDER BY command_name, role_id
    `;
    const mapped = rows.map(mapVConfigRow);
    vconfigCache.set(guildId, mapped);
    return mapped;
  } catch {
    return [];
  }
}

export async function saveVConfigRule(
  guildId: string,
  commandName: string,
  roleId: string,
  mode: 'wl' | 'bl',
  channelIds: string[],
): Promise<VConfigRule> {
  const db = getDb();
  const rows = await db`
    INSERT INTO vconfig_rules (guild_id, command_name, role_id, mode, channel_ids, updated_at)
    VALUES (${guildId}, ${commandName}, ${roleId}, ${mode}, ${channelIds}, NOW())
    ON CONFLICT (guild_id, command_name, role_id, mode)
    DO UPDATE SET channel_ids = ${channelIds}, updated_at = NOW()
    RETURNING *
  `;
  invalidateVConfigCache(guildId);
  return mapVConfigRow(rows[0]);
}

export async function removeVConfigRule(
  guildId: string,
  commandName: string,
  roleId: string,
  mode: 'wl' | 'bl',
): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM vconfig_rules
    WHERE guild_id = ${guildId}
      AND command_name = ${commandName}
      AND role_id = ${roleId}
      AND mode = ${mode}
  `;
  invalidateVConfigCache(guildId);
  return result.count > 0;
}

export async function deleteVConfigRuleById(id: number, guildId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM vconfig_rules
    WHERE id = ${id} AND guild_id = ${guildId}
  `;
  invalidateVConfigCache(guildId);
  return result.count > 0;
}

export async function getVConfigRules(
  guildId: string,
  commandName: string,
  roleId?: string,
): Promise<VConfigRule[]> {
  const all = await getVConfigRulesForGuild(guildId);
  return all.filter((r) => {
    if (r.commandName !== commandName) return false;
    if (roleId && r.roleId !== roleId) return false;
    return true;
  });
}

function mapVConfigRow(row: Record<string, unknown>): VConfigRule {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    commandName: row.command_name as string,
    roleId: row.role_id as string,
    mode: row.mode as 'wl' | 'bl',
    channelIds: (row.channel_ids as string[]) || [],
    createdAt: new Date(row.created_at as Date),
    updatedAt: new Date(row.updated_at as Date),
  };
}
