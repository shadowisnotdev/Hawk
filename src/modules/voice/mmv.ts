import { PermissionsBitField } from 'discord.js';
import type { GuildMember, VoiceBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { resolveVoiceChannel } from '../../core/resolver/VoiceChannelResolver.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';

export default defineCommand({
  name: 'mmv',
  aliases: ['move', 'multimove'],
  module: 'voice',
  description: 'Moves mentioned users to a specified destination voice channel or the voice channel of the last mentioned user.',
  usage: 'mmv <users...> <destination VC or user>',
  examples: ['mmv @UserA #General', 'mmv @UserA @UserB #Hangout', 'mmv @UserA @TargetUser'],
  permissions: [PermissionsBitField.Flags.MoveMembers],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    const rawArgs = [...parsed.args];
    if (rawArgs.length === 0 && !replyTarget) {
      await respond.error('Usage: `mmv <users...> <destination VC or user>` or reply to a message.');
      return;
    }

    if (rawArgs.length < 1 && replyTarget) {
      await respond.error('Please specify a destination voice channel or user.');
      return;
    }

    // Destination is the last argument
    const destArg = rawArgs.pop()!;
    let destVc: VoiceBasedChannel | null = null;
    let destName = '';

    // 1. Check if destination is a Voice Channel (via 3-tier matcher)
    const vcResult = resolveVoiceChannel(destArg, guild);
    if (vcResult.success) {
      destVc = vcResult.value.channel;
      destName = destVc.name;
    } else {
      // 2. Check if destination is a User
      const userResult = await resolveUser(destArg, guild);
      if (userResult.success && userResult.value.member) {
        const destMember = userResult.value.member;
        if (!destMember.voice.channel) {
          await respond.error(`${mentionUser(destMember.id)} is not currently in a voice channel.`);
          return;
        }
        destVc = destMember.voice.channel;
        destName = destVc.name;
      }
    }

    if (!destVc) {
      await respond.error(`Could not resolve destination channel or user from \`${destArg}\`.`);
      return;
    }

    // Resolve target users (including replied user if applicable)
    const targetMembers: GuildMember[] = [];
    const seenIds = new Set<string>();
    const failures: string[] = [];

    if (replyTarget) {
      targetMembers.push(replyTarget);
      seenIds.add(replyTarget.id);
    }

    for (const arg of rawArgs) {
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
      await respond.error('Please specify at least one target user to move.');
      return;
    }

    const botMember = guild.members.me;
    if (botMember && !destVc.permissionsFor(botMember).has([PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.MoveMembers])) {
      await respond.error(`I lack permission to move members into **${destVc.name}**.`);
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'mmv', destVc.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const successes: string[] = [];

    for (const target of targetMembers) {
      if (!target.voice.channel) {
        failures.push(`${mentionUser(target.id)} (not in VC)`);
        continue;
      }

      if (target.voice.channelId === destVc.id) {
        failures.push(`${mentionUser(target.id)} (already in destination)`);
        continue;
      }

      try {
        await target.voice.setChannel(destVc);
        successes.push(mentionUser(target.id));
      } catch (err) {
        consoleLog('error', 'command_failure', `mmv: failed to move ${target.id}`, { error: String(err) });
        failures.push(`${mentionUser(target.id)} (failed)`);
      }
    }

    if (successes.length > 0 && failures.length === 0) {
      await respond.success(`Moved ${successes.join(', ')} to **${destName}**.`);
    } else if (successes.length > 0 && failures.length > 0) {
      await respond.send(`> Moved ${successes.join(', ')} to **${destName}**.\n> **Notice:** ${failures.join(', ')}`);
    } else {
      await respond.error(`Could not move target(s): ${failures.join(', ')}`);
    }
  },
});

