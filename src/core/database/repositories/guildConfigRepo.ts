import { getDb } from '../pool.js';
import type { GuildConfig } from '../../../types/config.js';
import { constants } from '../../config/constants.js';
import { TTLCache } from '../../utils/TTLCache.js';

const prefixCache = new TTLCache<string, string>(300_000);
const logChannelCache = new TTLCache<string, string | null>(300_000);

export async function getPrefix(guildId: string): Promise<string> {
  const cached = prefixCache.get(guildId);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const db = getDb();
    const rows = await db`SELECT prefix FROM guild_config WHERE guild_id = ${guildId}`;
    const prefix = rows[0]?.prefix ?? constants.defaultPrefix;

    prefixCache.set(guildId, prefix);
    return prefix;
  } catch {
    return constants.defaultPrefix;
  }
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO guild_config (guild_id, prefix)
    VALUES (${guildId}, ${prefix})
    ON CONFLICT (guild_id)
    DO UPDATE SET prefix = ${prefix}, updated_at = NOW()
  `;
  prefixCache.set(guildId, prefix);
}

export async function getLogChannel(guildId: string): Promise<string | null> {
  const cached = logChannelCache.get(guildId);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const db = getDb();
    const rows = await db`SELECT log_channel_id FROM guild_config WHERE guild_id = ${guildId}`.catch(async () => {
      await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS log_channel_id TEXT`.catch(() => {});
      return await db`SELECT log_channel_id FROM guild_config WHERE guild_id = ${guildId}`.catch(() => []);
    });
    const channelId = (rows[0]?.log_channel_id as string) ?? null;

    logChannelCache.set(guildId, channelId);
    return channelId;
  } catch {
    return null;
  }
}

export async function setLogChannel(guildId: string, channelId: string | null): Promise<void> {
  const db = getDb();
  try {
    await db`
      INSERT INTO guild_config (guild_id, log_channel_id)
      VALUES (${guildId}, ${channelId})
      ON CONFLICT (guild_id)
      DO UPDATE SET log_channel_id = ${channelId}, updated_at = NOW()
    `;
  } catch (err: any) {
    if (err?.message?.includes('log_channel_id') || err?.code === '42703') {
      await db`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS log_channel_id TEXT`.catch(() => {});
      await db`
        INSERT INTO guild_config (guild_id, log_channel_id)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id)
        DO UPDATE SET log_channel_id = ${channelId}, updated_at = NOW()
      `;
    } else {
      throw err;
    }
  }
  logChannelCache.set(guildId, channelId);
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM guild_config WHERE guild_id = ${guildId}`;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    guildId: row.guild_id as string,
    prefix: row.prefix as string,
    logChannelId: (row.log_channel_id as string) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function ensureGuildConfig(guildId: string): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO guild_config (guild_id)
    VALUES (${guildId})
    ON CONFLICT (guild_id) DO NOTHING
  `;
}

export function invalidatePrefixCache(guildId: string): void {
  prefixCache.invalidate(guildId);
}

export function invalidateLogChannelCache(guildId: string): void {
  logChannelCache.invalidate(guildId);
}

export function invalidateGuildConfig(guildId: string) { prefixCache.invalidate(guildId); logChannelCache.invalidate(guildId); }
