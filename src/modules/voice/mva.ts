import { PermissionsBitField } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';
import {
  createMvaMonitor,
  cancelMvaTarget,
  cancelAllMva,
  getAuthorMonitors,
} from './MvaManager.js';

export default defineCommand({
  name: 'mva',
  aliases: ['autodrag', 'fmv'],
  module: 'voice',
  description: 'Sets up an autodragger monitor for target users (drags immediately or within 5 min when they connect).',
  usage: 'mva <users...> | mva cancel [user] | mva cancel all',
  examples: ['mva @User', 'mva @User1 @User2', 'mva cancel', 'mva cancel @User', 'mva cancel all'],
  permissions: [PermissionsBitField.Flags.MoveMembers],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget, channel } = ctx;

    if (parsed.args.length === 0 && !replyTarget) {
      await respond.error('Usage: `mva <user(s)>` or `mva cancel [user]` or `mva cancel all`');
      return;
    }

    const firstArg = parsed.args[0]?.toLowerCase();

    // ── Cancellation Sub-commands ──
    if (firstArg === 'cancel') {
      const secondArg = parsed.args[1]?.toLowerCase();

      if (secondArg === 'all') {
        const count = cancelAllMva(guild.id, member.id);
        if (count > 0) {
          await respond.success(`Cancelled all **${count}** active autodrag monitor(s).`);
        } else {
          await respond.info('You have no active autodrag monitors.');
        }
        return;
      }

      // cancel <user>
      if (parsed.args.length > 1) {
        const targetRes = await resolveUser(parsed.args.slice(1).join(' '), guild);
        if (!targetRes.success) {
          await respond.error(targetRes.error);
          return;
        }
        const cancelled = cancelMvaTarget(guild.id, member.id, targetRes.value.id);
        if (cancelled) {
          await respond.success(`Cancelled autodrag monitor for ${mentionUser(targetRes.value.id)}.`);
        } else {
          await respond.error(`No active autodrag monitor found for ${mentionUser(targetRes.value.id)}.`);
        }
        return;
      }

      // cancel (single target check)
      const current = getAuthorMonitors(guild.id, member.id);
      if (current.length === 0) {
        await respond.info('You have no active autodrag monitors.');
        return;
      }
      if (current.length === 1) {
        cancelMvaTarget(guild.id, member.id, current[0].targetId);
        await respond.success(`Cancelled autodrag monitor for ${mentionUser(current[0].targetId)}.`);
        return;
      }

      await respond.warning(
        `You have **${current.length}** active monitors. Specify which user to cancel (\`${parsed.prefix}mva cancel @user\`) or use \`${parsed.prefix}mva cancel all\`.`
      );
      return;
    }

    // ── Main mva setup ──
    const authorVc = member.voice.channel;
    if (!authorVc) {
      await respond.error('You must be connected to a voice channel to set up an autodragger.');
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'mva', authorVc.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const targetMembers: GuildMember[] = [];
    const seenIds = new Set<string>();
    const failures: string[] = [];

    if (replyTarget) {
      targetMembers.push(replyTarget);
      seenIds.add(replyTarget.id);
    }

    for (const arg of parsed.args) {
      const res = await resolveUser(arg, guild);
      if (res.success && res.value.member) {
        if (!seenIds.has(res.value.member.id)) {
          seenIds.add(res.value.member.id);
          targetMembers.push(res.value.member);
        }
      } else {
        failures.push(`\`${arg}\`: ${res.success ? 'not in server' : res.error}`);
      }
    }

    if (targetMembers.length === 0) {
      await respond.error('Please specify at least one valid user to autodrag.');
      return;
    }

    const immediateMoved: string[] = [];
    const monitored: string[] = [];

    for (const target of targetMembers) {
      if (target.id === member.id) {
        failures.push(`${mentionUser(target.id)} (cannot drag yourself)`);
        continue;
      }

      if (target.user.bot) {
        failures.push(`${mentionUser(target.id)} (cannot drag bots)`);
        continue;
      }

      // Immediate Action: If already in VC, drag instantly
      if (target.voice.channel) {
        if (target.voice.channelId === authorVc.id) {
          failures.push(`${mentionUser(target.id)} (already in your channel)`);
          continue;
        }

        try {
          await target.voice.setChannel(authorVc);
          immediateMoved.push(mentionUser(target.id));
        } catch {
          failures.push(`${mentionUser(target.id)} (move failed)`);
        }
        continue;
      }

      // Future Monitoring: If not in VC, monitor state for 5 minutes
      createMvaMonitor({
        guildId: guild.id,
        authorId: member.id,
        initialVoiceChannelId: authorVc.id,
        textChannelId: channel.id,
        targetMember: target,
      });

      monitored.push(mentionUser(target.id));
    }

    const notices: string[] = [];
    if (immediateMoved.length > 0) {
      notices.push(`Instantly moved ${immediateMoved.join(', ')} to **${authorVc.name}**.`);
    }
    if (monitored.length > 0) {
      notices.push(`Monitoring ${monitored.join(', ')} — will autodrag to **${authorVc.name}** when they join a voice channel (5m window).`);
    }
    if (failures.length > 0) {
      notices.push(`Could not process: ${failures.join(', ')}`);
    }

    await respond.send(notices.join('\n'));
  },
});

