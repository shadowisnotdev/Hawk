import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { parseTime, formatTime } from '../../core/utils/parsers.js';
import { isMemberManageable } from './roleHelpers.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { logAuditAction } from '../../core/logging/AuditLogger.js';

export default defineCommand({
  name: 'timeout',
  aliases: ['to', 'mute', 'muteuser'],
  module: 'moderation',
  description: 'Timeout / mute a member for a specified duration using Discord native timeouts.',
  usage: 'timeout <@user> <duration> [reason]',
  examples: [
    'timeout @User 10m Spamming in general',
    'timeout @User 1h30m Inappropriate language',
    'mute @User 2d',
  ],
  permissions: [PermissionsBitField.Flags.ModerateMembers],
  botPermissions: [PermissionsBitField.Flags.ModerateMembers],
  cooldown: 2,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    if (parsed.args.length === 0 && !replyTarget) {
      await respond.info(`Usage: \`${parsed.prefix}timeout <@user> <duration> [reason]\` (e.g. \`10m\`, \`1h30m\`, \`2d\`)`);
      return;
    }

    let targetMember: any = null;
    let durationArg = '';
    let reason = '';

    if (replyTarget) {
      targetMember = replyTarget;
      durationArg = parsed.args[0] || '';
      reason = parsed.args.slice(1).join(' ').trim() || 'No reason provided';
    } else {
      const uRes = await resolveUser(parsed.args[0], guild);
      if (uRes.success && uRes.value.member) {
        targetMember = uRes.value.member;
      }
      durationArg = parsed.args[1] || '';
      reason = parsed.args.slice(2).join(' ').trim() || 'No reason provided';
    }

    if (!targetMember) {
      await respond.error('Could not find the target member in this server.');
      return;
    }

    if (targetMember.id === member.id) {
      await respond.error('You cannot timeout yourself.');
      return;
    }

    if (!isMemberManageable(guild, targetMember, member)) {
      await respond.denied('You cannot timeout this member due to role hierarchy.');
      return;
    }

    if (!durationArg) {
      await respond.error(`Please provide a duration.\nUsage: \`${parsed.prefix}timeout <@user> <duration> [reason]\``);
      return;
    }

    // Removing timeout
    if (durationArg === '0' || durationArg === 'remove' || durationArg === 'off' || durationArg === 'untimeout') {
      try {
        await targetMember.timeout(null, `Timeout removed by ${member.user.tag}: ${reason}`);
        await respond.success(`Removed timeout from ${mentionUser(targetMember.id)}.`);
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
      return;
    }

    const durationMs = parseTime(durationArg);
    if (!durationMs || durationMs <= 0) {
      await respond.error('Invalid duration format. Use compact formats like `10s`, `15m`, `1h30m`, `7d` (max 28 days).');
      return;
    }

    const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord max 28 days
    if (durationMs > MAX_TIMEOUT_MS) {
      await respond.error('Discord native timeouts cannot exceed 28 days.');
      return;
    }

    try {
      await targetMember.timeout(durationMs, `Timed out by ${member.user.tag}: ${reason}`);
      await respond.success(
        `⏳ Timed out ${mentionUser(targetMember.id)} for **${formatTime(durationMs)}**.\n• **Reason:** ${reason}`
      );

      logAuditAction({
        guild,
        action: 'Timeout',
        executor: member,
        target: targetMember.user.tag,
        details: [
          `Target: <@${targetMember.id}>`,
          `Duration: ${formatTime(durationMs)}`,
          `Reason: ${reason}`,
        ],
      });
    } catch (err: any) {
      await respond.error(`Failed to timeout member: ${err?.message || String(err)}`);
    }
  },
});

