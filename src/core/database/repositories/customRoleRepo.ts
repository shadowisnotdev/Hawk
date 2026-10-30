import { getDb } from '../pool.js';

export interface CustomRoleAlias {
  guild_id: string;
  alias: string;
  role_id: string;
  required_role_id: string;
  created_at: Date;
}

export async function setCustomRoleAlias(
  guildId: string,
  alias: string,
  roleId: string,
  requiredRoleId: string,
): Promise<void> {
  const db = getDb();
  const lowerAlias = alias.toLowerCase().trim();
  await db`
    INSERT INTO custom_role_aliases (guild_id, alias, role_id, required_role_id, created_at)
    VALUES (${guildId}, ${lowerAlias}, ${roleId}, ${requiredRoleId}, NOW())
    ON CONFLICT (guild_id, alias)
    DO UPDATE SET
      role_id = EXCLUDED.role_id,
      required_role_id = EXCLUDED.required_role_id,
      created_at = NOW()
  `;
}

export async function getCustomRoleAlias(guildId: string, alias: string): Promise<CustomRoleAlias | null> {
  const db = getDb();
  const lowerAlias = alias.toLowerCase().trim();
  const rows = await db<CustomRoleAlias[]>`
    SELECT guild_id, alias, role_id, required_role_id, created_at
    FROM custom_role_aliases
    WHERE guild_id = ${guildId} AND alias = ${lowerAlias}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function getGuildCustomRoleAliases(guildId: string): Promise<CustomRoleAlias[]> {
  const db = getDb();
  return db<CustomRoleAlias[]>`
    SELECT guild_id, alias, role_id, required_role_id, created_at
    FROM custom_role_aliases
    WHERE guild_id = ${guildId}
    ORDER BY created_at DESC
  `;
}

export async function deleteCustomRoleAlias(guildId: string, alias: string): Promise<boolean> {
  const db = getDb();
  const lowerAlias = alias.toLowerCase().trim();
  const res = await db`
    DELETE FROM custom_role_aliases
    WHERE guild_id = ${guildId} AND alias = ${lowerAlias}
  `;
  return res.count > 0;
}

