import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { isMemberManageable } from './roleHelpers.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'kick',
  aliases: ['k'],
  module: 'moderation',
  description: 'Kick a member from the server.',
  usage: 'kick <@user> [reason]',
  examples: ['kick @User Breaking rules', 'kick @User'],
  permissions: [PermissionsBitField.Flags.KickMembers],
  botPermissions: [PermissionsBitField.Flags.KickMembers],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    let targetMember: any = null;
    let reason = '';

    if (replyTarget) {
      targetMember = replyTarget;
      reason = parsed.args.join(' ').trim() || 'No reason provided';
    } else if (parsed.args.length > 0) {
      const uRes = await resolveUser(parsed.args[0], guild);
      if (uRes.success && uRes.value.member) {
        targetMember = uRes.value.member;
      }
      reason = parsed.args.slice(1).join(' ').trim() || 'No reason provided';
    }

    if (!targetMember) {
      await respond.error(`Please specify a member to kick.\nUsage: \`${parsed.prefix}kick <@user> [reason]\``);
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot kick yourself.');
      return;
    }

    if (!isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot kick this member due to role hierarchy.');
      return;
    }

    try {
      await targetMember.kick(`Kicked by ${member.user.tag}: ${reason}`);
      await respond.success(`👢 Kicked ${mentionUser(targetMember.id)}.\n• **Reason:** ${reason}`);

      logAuditAction({
        guild,
        action: 'Kick',
        executor: member,
        target: targetMember.user.tag,
        details: [`Target: <@${targetMember.id}>`, `Reason: ${reason}`],
      });
    } catch (err: any) {
      await respond.error(`Failed to kick member: ${err?.message || String(err)}`);
    }
  },
});

