import { getDb } from '../database/pool.js';

const noPrefixUsers = new Map<string, boolean>();

function makeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function isNoPrefixEnabled(guildId: string, userId: string): boolean {
  return noPrefixUsers.get(makeKey(guildId, userId)) === true;
}

export function getNoPrefixUsersForGuild(guildId: string): string[] {
  const prefix = `${guildId}:`;
  const result: string[] = [];
  for (const [key, enabled] of noPrefixUsers.entries()) {
    if (enabled && key.startsWith(prefix)) {
      result.push(key.slice(prefix.length));
    }
  }
  return result;
}

export async function setNoPrefix(guildId: string, userId: string, enabled: boolean): Promise<void> {
  const key = makeKey(guildId, userId);
  if (enabled) {
    noPrefixUsers.set(key, true);
  } else {
    noPrefixUsers.delete(key);
  }

  try {
    const db = getDb();
    if (enabled) {
      await db`
        INSERT INTO no_prefix_users (guild_id, user_id, enabled)
        VALUES (${guildId}, ${userId}, true)
        ON CONFLICT (guild_id, user_id)
        DO UPDATE SET enabled = true
      `;
    } else {
      await db`
        DELETE FROM no_prefix_users
        WHERE guild_id = ${guildId} AND user_id = ${userId}
      `;
    }
  } catch {
    // Database operation error handled gracefully
  }
}

export async function toggleNoPrefix(guildId: string, userId: string): Promise<boolean> {
  const current = isNoPrefixEnabled(guildId, userId);
  const next = !current;
  await setNoPrefix(guildId, userId, next);
  return next;
}

export async function loadNoPrefixCache(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db`SELECT guild_id, user_id, enabled FROM no_prefix_users WHERE enabled = true`;
    noPrefixUsers.clear();
    for (const row of rows) {
      noPrefixUsers.set(makeKey(row.guild_id as string, row.user_id as string), true);
    }
  } catch {
    // Fallback if DB table not populated yet
  }
}
