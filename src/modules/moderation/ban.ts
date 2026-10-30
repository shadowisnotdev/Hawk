import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { isMemberManageable } from './roleHelpers.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'ban',
  aliases: ['b'],
  module: 'moderation',
  description: 'Ban a user from the server with optional message history deletion.',
  usage: 'ban <@user> [days_delete] [reason]',
  examples: ['ban @User 7 Severe misconduct', 'ban @User Breaking server rules'],
  permissions: [PermissionsBitField.Flags.BanMembers],
  botPermissions: [PermissionsBitField.Flags.BanMembers],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    let targetUser: any = null;
    let targetMember: any = null;
    let rawArgs = [...parsed.args];

    if (replyTarget) {
      targetMember = replyTarget;
      targetUser = replyTarget.user;
    } else if (rawArgs.length > 0) {
      const uRes = await resolveUser(rawArgs[0], guild);
      if (uRes.success) {
        targetUser = uRes.value.user;
        targetMember = uRes.value.member;
      }
      rawArgs = rawArgs.slice(1);
    }

    if (!targetUser) {
      await respond.error(`Please specify a user to ban.\nUsage: \`${parsed.prefix}ban <@user> [days_delete] [reason]\``);
      return;
    }

    if (targetUser.id === member.id) {
      await respond.error('You cannot ban yourself.');
      return;
    }

    if (targetMember && !isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot ban this member due to role hierarchy.');
      return;
    }

    let deleteMessageSeconds = 0;
    if (rawArgs.length > 0 && /^\d+$/.test(rawArgs[0])) {
      const days = Math.min(Math.max(parseInt(rawArgs[0], 10), 0), 7);
      deleteMessageSeconds = days * 86400;
      rawArgs = rawArgs.slice(1);
    }

    const reason = rawArgs.join(' ').trim() || 'No reason provided';

    try {
      await guild.members.ban(targetUser.id, {
        deleteMessageSeconds,
        reason: `Banned by ${member.user.tag}: ${reason}`,
      });

      await respond.success(
        `🔨 Banned **${targetUser.tag}** (${targetUser.id}).\n` +
        `• **Purged Messages:** ${deleteMessageSeconds > 0 ? `${deleteMessageSeconds / 86400} day(s)` : 'None'}\n` +
        `• **Reason:** ${reason}`
      );

      logAuditAction({
        guild,
        action: 'Ban',
        executor: member,
        target: targetUser.tag,
        details: [
          `Target: <@${targetUser.id}>`,
          `Purged Messages: ${deleteMessageSeconds / 86400} days`,
          `Reason: ${reason}`,
        ],
      });
    } catch (err: any) {
      await respond.error(`Failed to ban user: ${err?.message || String(err)}`);
    }
  },
});

