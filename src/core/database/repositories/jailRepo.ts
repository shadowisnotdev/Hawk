import { getDb } from '../pool.js';

export interface JailConfig {
  guildId: string;
  jailRoleId: string;
  jailChannelId: string | null;
  updatedAt: Date;
}

export interface JailedUser {
  id: number;
  guildId: string;
  userId: string;
  originalRoleIds: string[];
  jailedBy: string;
  reason: string | null;
  jailedAt: Date;
}

export async function getJailConfig(guildId: string): Promise<JailConfig | null> {
  const db = getDb();
  const rows = await db`SELECT * FROM jail_config WHERE guild_id = ${guildId}`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    guildId: r.guild_id,
    jailRoleId: r.jail_role_id,
    jailChannelId: r.jail_channel_id,
    updatedAt: new Date(r.updated_at),
  };
}

export async function setJailConfig(
  guildId: string,
  jailRoleId: string,
  jailChannelId?: string | null,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO jail_config (guild_id, jail_role_id, jail_channel_id, updated_at)
    VALUES (${guildId}, ${jailRoleId}, ${jailChannelId || null}, NOW())
    ON CONFLICT (guild_id)
    DO UPDATE SET
      jail_role_id = EXCLUDED.jail_role_id,
      jail_channel_id = EXCLUDED.jail_channel_id,
      updated_at = NOW()
  `;
}

export async function jailUser(
  guildId: string,
  userId: string,
  originalRoleIds: string[],
  jailedBy: string,
  reason?: string,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO jailed_users (guild_id, user_id, original_role_ids, jailed_by, reason, jailed_at)
    VALUES (${guildId}, ${userId}, ${originalRoleIds}, ${jailedBy}, ${reason || null}, NOW())
    ON CONFLICT (guild_id, user_id)
    DO UPDATE SET
      original_role_ids = EXCLUDED.original_role_ids,
      jailed_by = EXCLUDED.jailed_by,
      reason = EXCLUDED.reason,
      jailed_at = NOW()
  `;
}

export async function getJailedUser(guildId: string, userId: string): Promise<JailedUser | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM jailed_users
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    guildId: r.guild_id,
    userId: r.user_id,
    originalRoleIds: Array.isArray(r.original_role_ids) ? r.original_role_ids : [],
    jailedBy: r.jailed_by,
    reason: r.reason,
    jailedAt: new Date(r.jailed_at),
  };
}

export async function unjailUser(guildId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const res = await db`
    DELETE FROM jailed_users
    WHERE guild_id = ${guildId} AND user_id = ${userId}
  `;
  return res.count > 0;
}

