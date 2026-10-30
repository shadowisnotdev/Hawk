import { getDb } from '../pool.js';
import type { MediaChannelRecord } from '../../../types/media.js';
import { TTLCache } from '../../utils/TTLCache.js';

const mediaChannelsCache = new TTLCache<string, Set<string>>(5_000);

export function invalidateMediaCache(guildId: string): void {
  mediaChannelsCache.invalidate(guildId);
}

export async function addMediaChannel(guildId: string, channelId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    INSERT INTO media_channels (guild_id, channel_id)
    VALUES (${guildId}, ${channelId})
    ON CONFLICT (guild_id, channel_id) DO NOTHING
    RETURNING id
  `;
  if (result.length > 0) {
    const cached = mediaChannelsCache.get(guildId);
    if (cached) cached.add(channelId);
    return true;
  }
  return false;
}

export async function removeMediaChannel(guildId: string, channelId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM media_channels
    WHERE guild_id = ${guildId} AND channel_id = ${channelId}
  `;
  if (result.count > 0) {
    const cached = mediaChannelsCache.get(guildId);
    if (cached) cached.delete(channelId);
    return true;
  }
  return false;
}

export async function getMediaChannels(guildId: string): Promise<MediaChannelRecord[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM media_channels
    WHERE guild_id = ${guildId}
    ORDER BY created_at
  `;
  const records = rows.map(r => ({
    id: r.id as number,
    guildId: r.guild_id as string,
    channelId: r.channel_id as string,
    createdAt: r.created_at as Date,
  }));

  mediaChannelsCache.set(guildId, new Set(records.map(r => r.channelId)));
  return records;
}

export async function isMediaChannel(guildId: string, channelId: string): Promise<boolean> {
  const cached = mediaChannelsCache.get(guildId);
  if (cached !== undefined) {
    return cached.has(channelId);
  }
  const records = await getMediaChannels(guildId);
  const set = new Set(records.map(r => r.channelId));
  mediaChannelsCache.set(guildId, set);
  return set.has(channelId);
}

export async function setMediaAutoThread(guildId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO media_guild_configs (guild_id, auto_thread)
    VALUES (${guildId}, ${enabled})
    ON CONFLICT (guild_id)
    DO UPDATE SET auto_thread = ${enabled}, updated_at = NOW()
  `;
}

export async function getMediaAutoThread(guildId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT auto_thread FROM media_guild_configs
    WHERE guild_id = ${guildId}
  `;
  return rows[0]?.auto_thread ?? true;
}
