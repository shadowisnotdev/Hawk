import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { getJailedUser, unjailUser } from '../../core/database/repositories/jailRepo.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { isMemberManageable } from './roleHelpers.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'unjail',
  aliases: ['unquarantine'],
  module: 'moderation',
  description: 'Release a user from jail and restore their exact previous roles.',
  usage: 'unjail <@user> [reason]',
  examples: ['unjail @User Served time', 'unjail @User'],
  permissions: [PermissionsBitField.Flags.ManageRoles],
  botPermissions: [PermissionsBitField.Flags.ManageRoles],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    const targetQuery = parsed.args[0];
    let reason = parsed.args.slice(1).join(' ').trim() || 'No reason provided';

    let targetMember: any = null;
    if (targetQuery) {
      const uRes = await resolveUser(targetQuery, guild);
      if (uRes.success && uRes.value.member) {
        targetMember = uRes.value.member;
      }
    } else if (replyTarget) {
      targetMember = replyTarget;
      reason = parsed.args.join(' ').trim() || 'No reason provided';
    }

    if (!targetMember) {
      await respond.error(`Please specify a member to unjail.\nUsage: \`${parsed.prefix}unjail <@user> [reason]\``);
      return;
    }

    if (!isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot unjail this member due to role hierarchy.');
      return;
    }

    const jailedRecord = await getJailedUser(guild.id, targetMember.id);
    if (!jailedRecord) {
      await respond.error(`${mentionUser(targetMember.id)} is not registered as currently jailed.`);
      return;
    }

    try {
      // 1. Remove record from DB
      await unjailUser(guild.id, targetMember.id);

      // 2. Restore exact roles that still exist in guild
      const validRolesToRestore = jailedRecord.originalRoleIds.filter((rId) => guild.roles.cache.has(rId));

      await targetMember.roles.set(
        validRolesToRestore,
        `Unjailed by ${member.user.tag}: ${reason}`
      );

      await respond.success(
        `✅ Unjailed ${mentionUser(targetMember.id)}.\n` +
        `• **Restored Roles:** ${validRolesToRestore.length}\n` +
        `• **Reason:** ${reason}`
      );

      logAuditAction({
        guild,
        action: 'Unjail',
        executor: member,
        target: targetMember.user.tag,
        details: [
          `Target: <@${targetMember.id}>`,
          `Restored Roles: ${validRolesToRestore.length}`,
          `Reason: ${reason}`,
        ],
      });
    } catch (err: any) {
      await respond.error(`Failed to unjail member: ${err?.message || String(err)}`);
    }
  },
});

