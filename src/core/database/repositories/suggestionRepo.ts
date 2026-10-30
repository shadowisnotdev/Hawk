import { getDb } from '../pool.js';
import type {
  SuggestionRecord,
  SuggestionStatus,
  VoteType,
  VoteCounts,
  SuggestionBlacklistRecord,
} from '../../../types/suggestion.js';

// ── Suggestion Channel Config ───────────────────────────────

export async function setSuggestionChannel(guildId: string, channelId: string): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO suggestion_configs (guild_id, channel_id)
    VALUES (${guildId}, ${channelId})
    ON CONFLICT (guild_id)
    DO UPDATE SET channel_id = ${channelId}, updated_at = NOW()
  `;
}

export async function getSuggestionChannel(guildId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db`SELECT channel_id FROM suggestion_configs WHERE guild_id = ${guildId}`;
  return rows[0]?.channel_id ?? null;
}

export async function setSuggestionPanelMessageId(guildId: string, messageId: string | null): Promise<void> {
  const db = getDb();
  await db`
    UPDATE suggestion_configs
    SET panel_message_id = ${messageId}, updated_at = NOW()
    WHERE guild_id = ${guildId}
  `;
}

export async function getSuggestionPanelMessageId(guildId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db`SELECT panel_message_id FROM suggestion_configs WHERE guild_id = ${guildId}`;
  return rows[0]?.panel_message_id ?? null;
}

export async function getSuggestionConfig(guildId: string): Promise<{ channelId: string; panelMessageId: string | null } | null> {
  try {
    const db = getDb();
    const rows = await db`SELECT channel_id, panel_message_id FROM suggestion_configs WHERE guild_id = ${guildId}`;
    if (rows.length === 0) return null;
    return {
      channelId: rows[0].channel_id as string,
      panelMessageId: (rows[0].panel_message_id as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function getAllSuggestionConfigs(): Promise<{ guildId: string; channelId: string; panelMessageId: string | null }[]> {
  try {
    const db = getDb();
    const rows = await db`SELECT guild_id, channel_id, panel_message_id FROM suggestion_configs`;
    return rows.map(r => ({
      guildId: r.guild_id as string,
      channelId: r.channel_id as string,
      panelMessageId: (r.panel_message_id as string) ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Sequential Guild Counter ────────────────────────────────

export async function getNextSuggestionNumber(guildId: string): Promise<number> {
  const db = getDb();
  return await db.begin(async (tx) => {
    const rows = await tx`
      INSERT INTO suggestion_counters (guild_id, last_number)
      VALUES (${guildId}, 1)
      ON CONFLICT (guild_id)
      DO UPDATE SET last_number = suggestion_counters.last_number + 1
      RETURNING last_number
    `;
    return rows[0].last_number as number;
  });
}

// ── Suggestions CRUD ────────────────────────────────────────

export async function createSuggestion(
  guildId: string,
  authorId: string,
  content: string,
  channelId: string,
  messageId: string,
): Promise<SuggestionRecord> {
  const db = getDb();
  const nextNum = await getNextSuggestionNumber(guildId);

  const rows = await db`
    INSERT INTO suggestions (guild_id, number, author_id, content, channel_id, message_id)
    VALUES (${guildId}, ${nextNum}, ${authorId}, ${content}, ${channelId}, ${messageId})
    RETURNING *
  `;

  return mapSuggestionRow(rows[0]);
}

export async function getSuggestionByNumber(guildId: string, number: number): Promise<SuggestionRecord | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM suggestions
    WHERE guild_id = ${guildId} AND number = ${number}
  `;
  if (rows.length === 0) return null;
  return mapSuggestionRow(rows[0]);
}

export async function getSuggestionByMessageId(guildId: string, messageId: string): Promise<SuggestionRecord | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM suggestions
    WHERE guild_id = ${guildId} AND message_id = ${messageId}
  `;
  if (rows.length === 0) return null;
  return mapSuggestionRow(rows[0]);
}

export async function getSuggestionById(suggestionId: number): Promise<SuggestionRecord | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM suggestions WHERE id = ${suggestionId}`;
  if (rows.length === 0) return null;
  return mapSuggestionRow(rows[0]);
}

export async function updateSuggestionMessageId(suggestionId: number, messageId: string): Promise<void> {
  const db = getDb();
  await db`UPDATE suggestions SET message_id = ${messageId} WHERE id = ${suggestionId}`;
}

export async function updateSuggestionStatus(
  suggestionId: number,
  status: SuggestionStatus,
  staffId: string,
): Promise<SuggestionRecord | null> {
  const db = getDb();
  const rows = await db`
    UPDATE suggestions
    SET status = ${status},
        staff_id = ${staffId},
        staff_action_at = NOW(),
        updated_at = NOW()
    WHERE id = ${suggestionId}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return mapSuggestionRow(rows[0]);
}

// ── Voting Logic (Atomic) ────────────────────────────────────

export async function castVote(
  guildId: string,
  suggestionId: number,
  userId: string,
  voteType: VoteType,
): Promise<{ counts: VoteCounts; userVote: VoteType; previousVote: VoteType | null }> {
  const db = getDb();

  return await db.begin(async (tx) => {
    const prevRows = await tx`
      SELECT vote_type FROM suggestion_votes
      WHERE suggestion_id = ${suggestionId} AND user_id = ${userId}
    `;
    const previousVote = (prevRows[0]?.vote_type as VoteType) ?? null;

    await tx`
      INSERT INTO suggestion_votes (guild_id, suggestion_id, user_id, vote_type)
      VALUES (${guildId}, ${suggestionId}, ${userId}, ${voteType})
      ON CONFLICT (suggestion_id, user_id)
      DO UPDATE SET vote_type = ${voteType}, updated_at = NOW()
    `;

    const upRows = await tx`
      SELECT COUNT(*)::int as count FROM suggestion_votes
      WHERE suggestion_id = ${suggestionId} AND vote_type = 'up'
    `;
    const downRows = await tx`
      SELECT COUNT(*)::int as count FROM suggestion_votes
      WHERE suggestion_id = ${suggestionId} AND vote_type = 'down'
    `;

    return {
      counts: {
        upvotes: (upRows[0]?.count as number) ?? 0,
        downvotes: (downRows[0]?.count as number) ?? 0,
      },
      userVote: voteType,
      previousVote,
    };
  });
}

export async function removeVote(
  guildId: string,
  suggestionId: number,
  userId: string,
): Promise<VoteCounts> {
  const db = getDb();
  await db`
    DELETE FROM suggestion_votes
    WHERE guild_id = ${guildId} AND suggestion_id = ${suggestionId} AND user_id = ${userId}
  `;
  return await getVoteCounts(suggestionId);
}

export async function getUserVote(
  guildId: string,
  suggestionId: number,
  userId: string,
): Promise<VoteType | null> {
  const db = getDb();
  const rows = await db`
    SELECT vote_type FROM suggestion_votes
    WHERE guild_id = ${guildId} AND suggestion_id = ${suggestionId} AND user_id = ${userId}
  `;
  return (rows[0]?.vote_type as VoteType) ?? null;
}

export async function getVoteCounts(suggestionId: number): Promise<VoteCounts> {
  const db = getDb();
  const upRows = await db`
    SELECT COUNT(*)::int as count FROM suggestion_votes
    WHERE suggestion_id = ${suggestionId} AND vote_type = 'up'
  `;
  const downRows = await db`
    SELECT COUNT(*)::int as count FROM suggestion_votes
    WHERE suggestion_id = ${suggestionId} AND vote_type = 'down'
  `;
  return {
    upvotes: (upRows[0]?.count as number) ?? 0,
    downvotes: (downRows[0]?.count as number) ?? 0,
  };
}

// ── Blacklist Repository ─────────────────────────────────────

export async function isBlacklisted(guildId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT 1 FROM suggestion_blacklists
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  return rows.length > 0;
}

export async function addBlacklist(guildId: string, userId: string, createdBy: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    INSERT INTO suggestion_blacklists (guild_id, user_id, created_by)
    VALUES (${guildId}, ${userId}, ${createdBy})
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `;
  return result.count > 0;
}

export async function removeBlacklist(guildId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db`
    DELETE FROM suggestion_blacklists
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  return result.count > 0;
}

export async function listBlacklist(guildId: string): Promise<SuggestionBlacklistRecord[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM suggestion_blacklists
    WHERE guild_id = ${guildId}
    ORDER BY created_at DESC
  `;
  return rows.map(r => ({
    id: r.id as number,
    guildId: r.guild_id as string,
    userId: r.user_id as string,
    createdBy: r.created_by as string,
    createdAt: r.created_at as Date,
  }));
}

// ── Module Reset (Destructive) ───────────────────────────────

export async function resetSuggestionDataForGuild(guildId: string): Promise<void> {
  const db = getDb();
  await db.begin(async (tx) => {
    await tx`DELETE FROM suggestion_votes WHERE guild_id = ${guildId}`;
    await tx`DELETE FROM suggestions WHERE guild_id = ${guildId}`;
    await tx`DELETE FROM suggestion_counters WHERE guild_id = ${guildId}`;
    await tx`DELETE FROM suggestion_configs WHERE guild_id = ${guildId}`;
    await tx`DELETE FROM suggestion_blacklists WHERE guild_id = ${guildId}`;
  });
}

function mapSuggestionRow(row: Record<string, unknown>): SuggestionRecord {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    number: row.number as number,
    authorId: row.author_id as string,
    content: row.content as string,
    channelId: row.channel_id as string,
    messageId: row.message_id as string,
    status: row.status as SuggestionStatus,
    staffId: (row.staff_id as string) ?? null,
    staffActionAt: (row.staff_action_at as Date) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
