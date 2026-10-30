import { getDb } from '../pool.js';

export interface ActivityEntry {
  id?: number;
  guild_id: string;
  type: string;
  actor_id?: string | null;
  actor_name?: string | null;
  target_name?: string | null;
  details?: Record<string, any>;
  created_at?: Date;
}

export async function logActivity(entry: {
  guildId: string;
  type: string;
  actorId?: string | null;
  actorName?: string | null;
  targetName?: string | null;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    const db = getDb();
    await db`
      INSERT INTO activity_log (guild_id, type, actor_id, actor_name, target_name, details)
      VALUES (
        ${entry.guildId},
        ${entry.type},
        ${entry.actorId ?? null},
        ${entry.actorName ?? null},
        ${entry.targetName ?? null},
        ${entry.details ? JSON.stringify(entry.details) : '{}'}
      )
    `;
  } catch (err) {
    // Non-blocking write - do not crash handlers on activity logging failure
    console.warn('Failed to log activity:', err);
  }
}

export async function getRecentActivities(
  guildId: string,
  limit: number = 5,
  offset: number = 0,
  filterType?: string
) {
  try {
    const db = getDb();
    if (filterType && filterType !== 'all') {
      return await db`
        SELECT * FROM activity_log
        WHERE guild_id = ${guildId} AND type = ${filterType}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }
    return await db`
      SELECT * FROM activity_log
      WHERE guild_id = ${guildId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } catch (err) {
    console.warn('Failed to fetch recent activities:', err);
    return [];
  }
}
