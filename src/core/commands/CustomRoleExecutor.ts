import { PermissionsBitField, type GuildMember } from 'discord.js';
import { defineCommand, type CommandDefinition, type CommandContext } from '../../types/command.js';
import { getCustomRoleAlias } from '../database/repositories/customRoleRepo.js';
import { resolveUser } from '../resolver/UserResolver.js';
import { mentionRole, mentionUser } from '../utils/formatters.js';

export async function resolveCustomRoleCommand(guildId: string, name: string): Promise<CommandDefinition | null> {
  const customRole = await getCustomRoleAlias(guildId, name);
  if (!customRole) return null;

  return defineCommand({
    name: customRole.alias,
    module: 'customrole',
    description: `Dynamic role assignment for alias ${customRole.alias}`,
    cooldown: 2,
    execute: async (ctx: CommandContext) => {
      const { member, guild, respond, replyTarget, parsed } = ctx;

      // Permission Guard: Restricts execution only to users possessing the required role
      const hasRequiredRole =
        member.roles.cache.has(customRole.required_role_id) ||
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.id === guild.ownerId;

      if (!hasRequiredRole) {
        await respond.denied(`You must have the ${mentionRole(customRole.required_role_id, guild)} role to use this command.`);
        return;
      }

      let targetMember: GuildMember | null = null;

      if (parsed.args.length > 0) {
        const uRes = await resolveUser(parsed.args.join(' '), guild);
        if (uRes.success && uRes.value.member) {
          targetMember = uRes.value.member;
        } else {
          await respond.error(`Could not find user: ${uRes.success ? 'User not in server' : uRes.error}`);
          return;
        }
      } else if (replyTarget) {
        targetMember = replyTarget;
      }

      if (!targetMember) {
        await respond.error(`Please mention or reply to a user to toggle this role.\nUsage: \`${parsed.prefix}${customRole.alias} @user\``);
        return;
      }

      const targetRole = guild.roles.cache.get(customRole.role_id);
      if (!targetRole) {
        await respond.error('The configured role no longer exists in this server.');
        return;
      }

      // Bot permission & hierarchy check
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        await respond.error('I lack the **Manage Roles** permission to assign this role.');
        return;
      }

      if (botMember.roles.highest.comparePositionTo(targetRole) <= 0) {
        await respond.error(`I cannot assign ${mentionRole(targetRole, guild)} because it is higher than or equal to my highest role.`);
        return;
      }

      // Assign or toggle target role on user
      if (targetMember.roles.cache.has(targetRole.id)) {
        try {
          await targetMember.roles.remove(targetRole, `Custom role toggle (${customRole.alias}) by ${member.user.tag}`);
          await respond.success(`Removed ${mentionRole(targetRole, guild)} from ${mentionUser(targetMember.id)}.`);
        } catch {
          await respond.error(`Failed to remove ${mentionRole(targetRole, guild)} from ${mentionUser(targetMember.id)}.`);
        }
      } else {
        try {
          await targetMember.roles.add(targetRole, `Custom role toggle (${customRole.alias}) by ${member.user.tag}`);
          await respond.success(`Given ${mentionRole(targetRole, guild)} to ${mentionUser(targetMember.id)}.`);
        } catch {
          await respond.error(`Failed to give ${mentionRole(targetRole, guild)} to ${mentionUser(targetMember.id)}.`);
        }
      }
    },
  });
}

