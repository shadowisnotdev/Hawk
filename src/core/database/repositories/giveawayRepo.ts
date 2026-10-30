import { getDb } from '../pool.js';

export interface GiveawayRecord {
  id: number;
  messageId: string;
  channelId: string;
  guildId: string;
  hostId: string;
  prize: string;
  winnerCount: number;
  requiredRoleId: string | null;
  endsAt: Date;
  ended: boolean;
  winners: string[];
  createdAt: Date;
}

export async function createGiveaway(input: {
  messageId: string;
  channelId: string;
  guildId: string;
  hostId: string;
  prize: string;
  winnerCount: number;
  requiredRoleId?: string | null;
  endsAt: Date;
}): Promise<GiveawayRecord> {
  const db = getDb();
  const rows = await db`
    INSERT INTO giveaways (
      message_id, channel_id, guild_id, host_id, prize, winner_count, required_role_id, ends_at
    ) VALUES (
      ${input.messageId},
      ${input.channelId},
      ${input.guildId},
      ${input.hostId},
      ${input.prize},
      ${input.winnerCount},
      ${input.requiredRoleId || null},
      ${input.endsAt}
    )
    RETURNING *
  `;
  return mapGiveawayRow(rows[0]);
}

export async function getGiveawayByMessageId(messageId: string): Promise<GiveawayRecord | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM giveaways WHERE message_id = ${messageId}`;
  if (rows.length === 0) return null;
  return mapGiveawayRow(rows[0]);
}

export async function getGiveawayById(id: number): Promise<GiveawayRecord | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM giveaways WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return mapGiveawayRow(rows[0]);
}

export async function getActiveGiveaways(): Promise<GiveawayRecord[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM giveaways
    WHERE ended = FALSE
    ORDER BY ends_at ASC
  `;
  return rows.map(mapGiveawayRow);
}

export async function addGiveawayEntry(giveawayId: number, userId: string): Promise<boolean> {
  const db = getDb();
  try {
    const res = await db`
      INSERT INTO giveaway_entries (giveaway_id, user_id)
      VALUES (${giveawayId}, ${userId})
      ON CONFLICT (giveaway_id, user_id) DO NOTHING
      RETURNING id
    `;
    return res.length > 0;
  } catch {
    return false;
  }
}

export async function getGiveawayEntries(giveawayId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db`
    SELECT user_id FROM giveaway_entries
    WHERE giveaway_id = ${giveawayId}
  `;
  return rows.map((r: any) => r.user_id as string);
}

export async function getGiveawayEntryCount(giveawayId: number): Promise<number> {
  const db = getDb();
  const rows = await db`
    SELECT COUNT(*)::int AS count
    FROM giveaway_entries
    WHERE giveaway_id = ${giveawayId}
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function endGiveaway(id: number, winners: string[]): Promise<void> {
  const db = getDb();
  await db`
    UPDATE giveaways
    SET ended = TRUE, winners = ${winners}
    WHERE id = ${id}
  `;
}

function mapGiveawayRow(r: any): GiveawayRecord {
  return {
    id: r.id,
    messageId: r.message_id,
    channelId: r.channel_id,
    guildId: r.guild_id,
    hostId: r.host_id,
    prize: r.prize,
    winnerCount: r.winner_count,
    requiredRoleId: r.required_role_id,
    endsAt: new Date(r.ends_at),
    ended: Boolean(r.ended),
    winners: Array.isArray(r.winners) ? r.winners : [],
    createdAt: new Date(r.created_at),
  };
}

