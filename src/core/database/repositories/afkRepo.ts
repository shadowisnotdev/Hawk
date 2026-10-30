import { getDb } from '../pool.js';

export interface AfkRecord {
  guildId: string;
  userId: string;
  reason: string;
  startedAt: Date;
  channelId?: string | null;
  messageId?: string | null;
  nicknameSet?: boolean;
  originalNickname?: string | null;
  afkNickname?: string | null;
}

export interface CachedAfk {
  reason: string;
  startedAt: Date;
  channelId?: string | null;
  messageId?: string | null;
  nicknameSet?: boolean;
  originalNickname?: string | null;
  afkNickname?: string | null;
}

// In-memory cache for hot-path AFK checks in messageCreate: guildId -> userId -> CachedAfk
const afkCache = new Map<string, Map<string, CachedAfk>>();

export function getAfkCacheSize(): number {
  let count = 0;
  for (const guildMap of afkCache.values()) {
    count += guildMap.size;
  }
  return count;
}

export function getAfkEntriesForGuild(guildId: string): (CachedAfk & { userId: string })[] {
  const guildMap = afkCache.get(guildId);
  if (!guildMap) return [];
  const entries: (CachedAfk & { userId: string })[] = [];
  guildMap.forEach((val, userId) => {
    entries.push({ userId, ...val });
  });
  return entries;
}

export async function clearAllAfkRecords(guildId?: string): Promise<void> {
  if (guildId) {
    afkCache.delete(guildId);
  } else {
    afkCache.clear();
  }

  try {
    const db = getDb();
    if (guildId) {
      await db`DELETE FROM afk_users WHERE guild_id = ${guildId}`;
    } else {
      await db`TRUNCATE TABLE afk_users`;
    }
  } catch {
    // Ignore DB errors
  }
}

export async function loadAfkCache(): Promise<number> {
  afkCache.clear();
  try {
    const db = getDb();
    const rows = await db`SELECT guild_id, user_id, reason, started_at, channel_id, message_id, nickname_set, original_nickname, afk_nickname FROM afk_users`;
    for (const row of rows) {
      const guildId = row.guild_id as string;
      const userId = row.user_id as string;
      const reason = row.reason as string;
      const startedAt = new Date(row.started_at as Date);
      const channelId = (row.channel_id as string) ?? null;
      const messageId = (row.message_id as string) ?? null;

      let guildMap = afkCache.get(guildId);
      if (!guildMap) {
        guildMap = new Map();
        afkCache.set(guildId, guildMap);
      }
      guildMap.set(userId, { reason, startedAt, channelId, messageId, nicknameSet: Boolean(row.nickname_set), originalNickname: row.original_nickname ?? null, afkNickname: row.afk_nickname ?? null });
    }
    return rows.length;
  } catch {
    return 0;
  }
}

export async function setAfk(
  guildId: string,
  userId: string,
  reason: string,
  channelId?: string | null,
  messageId?: string | null,
): Promise<CachedAfk> {
  const startedAt = new Date();

  try {
    const db = getDb();
    await db`
      INSERT INTO afk_users (guild_id, user_id, reason, started_at, channel_id, message_id)
      VALUES (${guildId}, ${userId}, ${reason}, ${startedAt}, ${channelId ?? null}, ${messageId ?? null})
      ON CONFLICT (guild_id, user_id)
      DO UPDATE SET reason = ${reason}, started_at = ${startedAt}, channel_id = ${channelId ?? null}, message_id = ${messageId ?? null}
    `;
  } catch {
    // Ignore DB errors if database is unavailable
  }

  let guildMap = afkCache.get(guildId);
  if (!guildMap) {
    guildMap = new Map();
    afkCache.set(guildId, guildMap);
  }
  const cached: CachedAfk = { ...guildMap.get(userId), reason, startedAt, channelId: channelId ?? null, messageId: messageId ?? null };
  guildMap.set(userId, cached);

  return cached;
}

export async function updateAfkMessageInfo(
  guildId: string,
  userId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const cached = afkCache.get(guildId)?.get(userId);
  if (cached) {
    cached.channelId = channelId;
    cached.messageId = messageId;
  }

  try {
    const db = getDb();
    await db`
      UPDATE afk_users
      SET channel_id = ${channelId}, message_id = ${messageId}
      WHERE guild_id = ${guildId} AND user_id = ${userId}
    `;
  } catch {
    // Ignore DB error
  }
}

export async function removeAfk(guildId: string, userId: string): Promise<CachedAfk | null> {
  const guildMap = afkCache.get(guildId);
  const cached = guildMap?.get(userId) ?? null;

  guildMap?.delete(userId);
  if (guildMap && guildMap.size === 0) {
    afkCache.delete(guildId);
  }

  try {
    const db = getDb();
    const rows = await db`
      DELETE FROM afk_users
      WHERE guild_id = ${guildId} AND user_id = ${userId}
      RETURNING reason, started_at, channel_id, message_id, nickname_set, original_nickname, afk_nickname
    `;
    if (rows.length > 0) {
      return {
        nicknameSet: Boolean(rows[0].nickname_set),
        originalNickname: rows[0].original_nickname ?? null,
        afkNickname: rows[0].afk_nickname ?? null,
        reason: rows[0].reason as string,
        startedAt: new Date(rows[0].started_at as Date),
        channelId: (rows[0].channel_id as string) ?? null,
        messageId: (rows[0].message_id as string) ?? null,
      };
    }
  } catch {
    // Ignore DB errors on remove
  }

  return cached;
}

export function getAfk(guildId: string, userId: string): CachedAfk | null {
  return afkCache.get(guildId)?.get(userId) ?? null;
}

export function isAfk(guildId: string, userId: string): boolean {
  return afkCache.get(guildId)?.has(userId) ?? false;
}

export async function markAfkNickname(guildId: string, userId: string, originalNickname: string | null, afkNickname: string): Promise<void> {
  const cached = getAfk(guildId, userId);
  if (!cached) return;
  Object.assign(cached, { nicknameSet: true, originalNickname, afkNickname });
  await getDb()`UPDATE afk_users SET nickname_set = TRUE, original_nickname = ${originalNickname}, afk_nickname = ${afkNickname} WHERE guild_id = ${guildId} AND user_id = ${userId}`;
}
