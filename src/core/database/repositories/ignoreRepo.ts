import { getDb } from '../pool.js';
import type { IgnoreRecord } from '../../../types/permission.js';
import { TTLCache } from '../../utils/TTLCache.js';

const ignoreCache = new TTLCache<string, IgnoreRecord[]>(30_000); // guildId -> IgnoreRecord[]

export function invalidateIgnoreCache(guildId: string): void {
  ignoreCache.invalidate(guildId);
}

export async function getIgnoresForGuild(guildId: string): Promise<IgnoreRecord[]> {
  const cached = ignoreCache.get(guildId);
  if (cached !== undefined) return cached;

  try {
    const db = getDb();
    const rows = await db`SELECT * FROM ignored_entities WHERE guild_id = ${guildId} ORDER BY created_at`;
    const mapped = rows.map(mapIgnoreRow);
    ignoreCache.set(guildId, mapped);
    return mapped;
  } catch {
    return [];
  }
}

export async function isIgnored(
  guildId: string,
  entityType: 'user' | 'role' | 'channel' | 'category',
  entityId: string,
  commandName?: string,
  moduleName?: string,
): Promise<boolean> {
  const ignores = await getIgnoresForGuild(guildId);
  return ignores.some((rec) => {
    if (rec.mode !== 'bl') return false;
    if (rec.entityType !== entityType || rec.entityId !== entityId) return false;
    const globalScope = rec.scopeType === null && rec.scopeId === null;
    const cmdScope = rec.scopeType === 'command' && rec.scopeId === (commandName ?? null);
    const modScope = rec.scopeType === 'module' && rec.scopeId === (moduleName ?? null);
    return globalScope || cmdScope || modScope;
  });
}

export async function isAnyRoleIgnored(
  guildId: string,
  roleIds: string[],
  commandName?: string,
  moduleName?: string,
): Promise<boolean> {
  if (roleIds.length === 0) return false;
  const ignores = await getIgnoresForGuild(guildId);
  return ignores.some((rec) => {
    if (rec.mode !== 'bl') return false;
    if (rec.entityType !== 'role' || !roleIds.includes(rec.entityId)) return false;
    const globalScope = rec.scopeType === null && rec.scopeId === null;
    const cmdScope = rec.scopeType === 'command' && rec.scopeId === (commandName ?? null);
    const modScope = rec.scopeType === 'module' && rec.scopeId === (moduleName ?? null);
    return globalScope || cmdScope || modScope;
  });
}

export async function addIgnore(
  guildId: string,
  entityType: 'user' | 'role' | 'channel' | 'category',
  entityId: string,
  scopeType: 'command' | 'module' | null,
  scopeId: string | null,
  mode: 'wl' | 'bl' = 'bl',
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO ignored_entities (guild_id, entity_type, entity_id, scope_type, scope_id, mode)
    VALUES (${guildId}, ${entityType}, ${entityId}, ${scopeType}, ${scopeId}, ${mode})
    ON CONFLICT (guild_id, entity_type, entity_id, scope_type, scope_id)
    DO UPDATE SET mode = ${mode}
  `;
  invalidateIgnoreCache(guildId);
}

export async function removeIgnore(
  guildId: string,
  entityType: 'user' | 'role' | 'channel' | 'category',
  entityId: string,
  scopeType: 'command' | 'module' | null,
  scopeId: string | null,
  mode?: 'wl' | 'bl',
): Promise<boolean> {
  const db = getDb();
  let result;
  if (mode) {
    result = await db`
      DELETE FROM ignored_entities
      WHERE guild_id = ${guildId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
        AND scope_type IS NOT DISTINCT FROM ${scopeType}
        AND scope_id IS NOT DISTINCT FROM ${scopeId}
        AND mode = ${mode}
    `;
  } else {
    result = await db`
      DELETE FROM ignored_entities
      WHERE guild_id = ${guildId}
        AND entity_type = ${entityType}
        AND entity_id = ${entityId}
        AND scope_type IS NOT DISTINCT FROM ${scopeType}
        AND scope_id IS NOT DISTINCT FROM ${scopeId}
    `;
  }
  invalidateIgnoreCache(guildId);
  return result.count > 0;
}

export async function getIgnoreEntries(guildId: string): Promise<IgnoreRecord[]> {
  return getIgnoresForGuild(guildId);
}

function mapIgnoreRow(row: Record<string, unknown>): IgnoreRecord {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    entityType: row.entity_type as IgnoreRecord['entityType'],
    entityId: row.entity_id as string,
    scopeType: row.scope_type as IgnoreRecord['scopeType'],
    scopeId: row.scope_id as string | null,
    mode: (row.mode as 'wl' | 'bl') || 'bl',
    createdAt: new Date(row.created_at as Date),
  };
}
