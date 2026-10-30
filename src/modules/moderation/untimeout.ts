import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { isMemberManageable } from './roleHelpers.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'untimeout',
  aliases: ['unmute', 'unto'],
  module: 'moderation',
  description: 'Remove timeout / unmute a member from the server.',
  usage: 'untimeout <@user> [reason]',
  examples: ['untimeout @User', 'untimeout @User Appeal accepted', 'unmute @User'],
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  botPermissions: [PermissionsBitField.Flags.ModerateMembers],
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    if (parsed.args.length === 0 && !replyTarget) {
      await respond.info(`Usage: \`${parsed.prefix}untimeout <@user> [reason]\` (or \`${parsed.prefix}unmute\`)`);
      return;
    }

    let targetMember: any = null;
    let reason = '';

    if (replyTarget) {
      targetMember = replyTarget;
      reason = parsed.args.join(' ').trim() || 'No reason provided';
    } else {
      const uRes = await resolveUser(parsed.args[0], guild);
      if (uRes.success && uRes.value.member) {
        targetMember = uRes.value.member;
      }
      reason = parsed.args.slice(1).join(' ').trim() || 'No reason provided';
    }

    if (!targetMember) {
      await respond.error('Could not find the target member in this server.');
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot untimeout yourself.');
      return;
    }

    if (!isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot untimeout this member due to role hierarchy.');
      return;
    }

    if (
      !targetMember.communicationDisabledUntilTimestamp ||
      targetMember.communicationDisabledUntilTimestamp <= Date.now()
    ) {
      await respond.error(`${mentionUser(targetMember.id)} is not currently timed out.`);
      return;
    }

    try {
      await targetMember.timeout(null, `Timeout removed by ${member.user.tag}: ${reason}`);
      await respond.success(
        `✅ Removed timeout from ${mentionUser(targetMember.id)}.\n• **Reason:** ${reason}`
      );

      logAuditAction({
        guild,
        action: 'Untimeout',
        executor: member,
        target: targetMember.user.tag,
        details: [`Target: <@${targetMember.id}>`, `Reason: ${reason}`],
      });
    } catch (err: any) {
      await respond.error(`Failed to remove timeout: ${err?.message || String(err)}`);
    }
  },
});

