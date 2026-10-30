import { getDb } from '../pool.js';
import type { StickyRecord, SetStickyInput } from '../../../types/sticky.js';

export async function setSticky(input: SetStickyInput): Promise<StickyRecord> {
  const db = getDb();
  const rows = await db`
    INSERT INTO sticky_messages (guild_id, channel_id, message_id, content)
    VALUES (${input.guildId}, ${input.channelId}, ${input.messageId}, ${input.content})
    ON CONFLICT (guild_id, channel_id)
    DO UPDATE SET message_id = ${input.messageId}, content = ${input.content}, updated_at = NOW()
    RETURNING *
  `;
  activeStickyChannels.add(`${input.guildId}:${input.channelId}`);
  return mapStickyRow(rows[0]);
}

const activeStickyChannels = new Set<string>();

export async function getSticky(guildId: string, channelId: string): Promise<StickyRecord | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM sticky_messages
    WHERE guild_id = ${guildId} AND channel_id = ${channelId}
  `;
  if (rows.length === 0) {
    activeStickyChannels.delete(`${guildId}:${channelId}`);
    return null;
  }
  activeStickyChannels.add(`${guildId}:${channelId}`);
  return mapStickyRow(rows[0]);
}

export async function updateStickyMessageId(guildId: string, channelId: string, messageId: string): Promise<void> {
  const db = getDb();
  await db`
    UPDATE sticky_messages
    SET message_id = ${messageId}, updated_at = NOW()
    WHERE guild_id = ${guildId} AND channel_id = ${channelId}
  `;
}

export async function getStickiesForGuild(guildId: string): Promise<StickyRecord[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM sticky_messages
    WHERE guild_id = ${guildId}
    ORDER BY created_at ASC
  `;
  return rows.map(mapStickyRow);
}

export async function deleteSticky(guildId: string, channelId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM sticky_messages
    WHERE guild_id = ${guildId} AND channel_id = ${channelId}
  `;
  if (result.count > 0) {
    activeStickyChannels.delete(`${guildId}:${channelId}`);
  }
  return result.count > 0;
}

function mapStickyRow(row: Record<string, unknown>): StickyRecord {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    channelId: row.channel_id as string,
    messageId: row.message_id as string,
    content: row.content as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
