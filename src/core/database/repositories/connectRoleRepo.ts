import { getDb } from '../pool.js';

export interface RoleConnection {
  id: number;
  guildId: string;
  mainRoleId: string;
  conditionalRoleIds: string[];
  requireAll: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function setRoleConnection(
  guildId: string,
  mainRoleId: string,
  conditionalRoleIds: string[],
  requireAll = false,
): Promise<RoleConnection> {
  const db = getDb();
  const rows = await db`
    INSERT INTO role_connections (
      guild_id, main_role_id, conditional_role_ids, require_all, updated_at
    ) VALUES (
      ${guildId}, ${mainRoleId}, ${conditionalRoleIds}, ${requireAll}, NOW()
    )
    ON CONFLICT (guild_id, main_role_id)
    DO UPDATE SET
      conditional_role_ids = EXCLUDED.conditional_role_ids,
      require_all = EXCLUDED.require_all,
      updated_at = NOW()
    RETURNING *
  `;
  return mapRoleConnectionRow(rows[0]);
}

export async function getRoleConnection(guildId: string, mainRoleId: string): Promise<RoleConnection | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM role_connections
    WHERE guild_id = ${guildId} AND main_role_id = ${mainRoleId}
  `;
  if (rows.length === 0) return null;
  return mapRoleConnectionRow(rows[0]);
}

export async function listRoleConnections(guildId: string): Promise<RoleConnection[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM role_connections
    WHERE guild_id = ${guildId}
    ORDER BY created_at ASC
  `;
  return rows.map(mapRoleConnectionRow);
}

export async function deleteRoleConnection(guildId: string, mainRoleId: string): Promise<boolean> {
  const db = getDb();
  const res = await db`
    DELETE FROM role_connections
    WHERE guild_id = ${guildId} AND main_role_id = ${mainRoleId}
  `;
  return res.count > 0;
}

function mapRoleConnectionRow(r: any): RoleConnection {
  return {
    id: r.id,
    guildId: r.guild_id,
    mainRoleId: r.main_role_id,
    conditionalRoleIds: Array.isArray(r.conditional_role_ids) ? r.conditional_role_ids : [],
    requireAll: Boolean(r.require_all),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

