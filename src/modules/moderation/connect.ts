import { PermissionsBitField, type GuildMember } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import {
  setRoleConnection,
  listRoleConnections,
  deleteRoleConnection,
  type RoleConnection,
} from '../../core/database/repositories/connectRoleRepo.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { mentionRole } from '../../core/utils/formatters.js';

export default defineCommand({
  name: 'connect',
  aliases: ['connectrole', 'linkrole'],
  module: 'moderation',
  description: 'Link conditional roles to automatically grant/revoke a main role.',
  usage: 'connect <main_role> <conditional_roles...> [--all] | connect list | connect remove <main_role> | connect sync',
  examples: [
    'connect "Staff Team" Moderator "Gaming Staff"',
    'connect "VIP Tier 2" Donator Booster --all',
    'connect list',
    'connect remove "Staff Team"',
    'connect sync',
  ],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, respond } = ctx;

    if (parsed.args.length === 0) {
      await respond.info(
        `**Conditional Role Connections:**\n` +
        `• \`${parsed.prefix}connect <main_role> <conditional_roles...> [--all]\` — Create connection\n` +
        `• \`${parsed.prefix}connect list\` — List all active role links\n` +
        `• \`${parsed.prefix}connect remove <main_role>\` — Delete a role link\n` +
        `• \`${parsed.prefix}connect sync\` — Run a full sync on all members`
      );
      return;
    }

    const sub = parsed.args[0].toLowerCase();

    // ── Subcommand: list ──
    if (sub === 'list') {
      const connections = await listRoleConnections(guild.id);
      if (connections.length === 0) {
        await respond.info('No conditional role connections are currently set up.');
        return;
      }

      const lines = connections.map((c) => {
        const conds = c.conditionalRoleIds.map((id) => mentionRole(id, guild)).join(', ');
        return `• ${mentionRole(c.mainRoleId, guild)} ➔ ${c.requireAll ? '**Requires ALL of:**' : '**Requires ANY of:**'} ${conds}`;
      });

      await respond.send(`**Active Role Connections (${connections.length}):**\n${lines.join('\n')}`);
      return;
    }

    // ── Subcommand: remove ──
    if (sub === 'remove' || sub === 'delete' || sub === 'unlink') {
      if (parsed.args.length < 2) {
        await respond.error(`Please specify the main role to unlink.\nUsage: \`${parsed.prefix}connect remove <main_role>\``);
        return;
      }

      const query = parsed.args.slice(1).join(' ');
      const roleRes = resolveRole(query, guild);
      if (!roleRes.success) {
        await respond.error(`Could not resolve main role: ${roleRes.error}`);
        return;
      }

      const deleted = await deleteRoleConnection(guild.id, roleRes.value.role.id);
      if (deleted) {
        await respond.success(`Removed role connection for ${mentionRole(roleRes.value.role.id, guild)}.`);
      } else {
        await respond.error(`No connection found for ${mentionRole(roleRes.value.role.id, guild)}.`);
      }
      return;
    }

    // ── Subcommand: sync ──
    if (sub === 'sync') {
      await respond.info('Starting role connection synchronization across all server members...');
      const connections = await listRoleConnections(guild.id);
      if (connections.length === 0) {
        await respond.info('No role connections to sync.');
        return;
      }

      const members = await guild.members.fetch().catch(() => guild.members.cache);
      let updatedCount = 0;

      for (const m of members.values()) {
        if (m.user.bot) continue;
        const modified = await evaluateMemberConnections(m, connections);
        if (modified) updatedCount++;
      }

      await respond.success(`Sync complete! Evaluated ${members.size} members and updated ${updatedCount} member(s).`);
      return;
    }

    // ── Create or Update Connection ──
    // Syntax: connect <main_role> <conditional_roles...> [--all]
    let requireAll = false;
    let cleanArgs = [...parsed.args];

    if (cleanArgs.includes('--all')) {
      requireAll = true;
      cleanArgs = cleanArgs.filter((a) => a !== '--all');
    }

    const mainRoleQuery = cleanArgs[0];
    const mainRoleRes = resolveRole(mainRoleQuery, guild);
    if (!mainRoleRes.success) {
      await respond.error(`Could not find main role: ${mainRoleRes.error}`);
      return;
    }

    const mainRole = mainRoleRes.value.role;
    if (mainRole.id === guild.id) {
      await respond.error('Cannot set @everyone as a conditional main role.');
      return;
    }

    // Check bot hierarchy
    const botMember = guild.members.me;
    if (botMember && botMember.roles.highest.comparePositionTo(mainRole) <= 0) {
      await respond.error(`I cannot manage ${mentionRole(mainRole, guild)} because it is higher than or equal to my highest role.`);
      return;
    }

    const conditionalQueries = cleanArgs.slice(1);
    if (conditionalQueries.length === 0) {
      await respond.error(`Please provide at least one conditional role.\nUsage: \`${parsed.prefix}connect <main_role> <conditional_roles...> [--all]\``);
      return;
    }

    const conditionalRoleIds: string[] = [];
    for (const q of conditionalQueries) {
      const cRes = resolveRole(q, guild);
      if (cRes.success && cRes.value.role.id !== guild.id) {
        conditionalRoleIds.push(cRes.value.role.id);
      }
    }

    if (conditionalRoleIds.length === 0) {
      await respond.error('None of the specified conditional roles could be resolved to valid guild roles.');
      return;
    }

    await setRoleConnection(guild.id, mainRole.id, conditionalRoleIds, requireAll);

    // Run quick sync for this specific connection
    const updatedConn: RoleConnection = {
      id: 0,
      guildId: guild.id,
      mainRoleId: mainRole.id,
      conditionalRoleIds,
      requireAll,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const cachedMembers = guild.members.cache;
    for (const m of cachedMembers.values()) {
      if (!m.user.bot) {
        await evaluateMemberConnections(m, [updatedConn]).catch(() => {});
      }
    }

    const condsList = conditionalRoleIds.map((id) => mentionRole(id, guild)).join(', ');
    await respond.success(
      `Linked conditional roles to ${mentionRole(mainRole, guild)}!\n` +
      `• **Condition:** ${requireAll ? 'Must hold **ALL** of' : 'Must hold **ANY** of'}\n` +
      `• **Conditional Roles:** ${condsList}\n` +
      `Members will automatically receive or lose ${mentionRole(mainRole, guild)} based on these conditions.`
    );
  },
});

/**
 * Checks a member against role connections and adds/removes main role as needed.
 * Returns true if a change was made.
 */
export async function evaluateMemberConnections(
  member: GuildMember,
  connections: RoleConnection[],
): Promise<boolean> {
  let changed = false;

  for (const conn of connections) {
    const hasMain = member.roles.cache.has(conn.mainRoleId);
    const matchesCondition = conn.requireAll
      ? conn.conditionalRoleIds.every((rId) => member.roles.cache.has(rId))
      : conn.conditionalRoleIds.some((rId) => member.roles.cache.has(rId));

    if (matchesCondition && !hasMain) {
      try {
        await member.roles.add(conn.mainRoleId, 'Conditional role connection match');
        changed = true;
      } catch {
        // Hierarchy or permission error
      }
    } else if (!matchesCondition && hasMain) {
      try {
        await member.roles.remove(conn.mainRoleId, 'Conditional role criteria no longer met');
        changed = true;
      } catch {
        // Hierarchy or permission error
      }
    }
  }

  return changed;
}

