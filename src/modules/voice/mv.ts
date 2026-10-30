import { PermissionsBitField } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { mentionUser } from '../../core/utils/formatters.js';
import { consoleLog } from '../../core/logging/ConsoleLogger.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';

export default defineCommand({
  name: 'mv',
  aliases: ['pull'],
  module: 'voice',
  description: "Drags all mentioned (or replied) users into the command author's voice channel.",
  usage: 'mv <users...>',
  examples: ['mv @UserA', 'mv @UserA @UserB', 'mv @UserA @UserB @UserC'],
  permissions: [PermissionsBitField.Flags.MoveMembers],
  botPermissions: [PermissionsBitField.Flags.MoveMembers],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    const authorVc = member.voice.channel;
    if (!authorVc) {
      await respond.error('You must be connected to a voice channel to drag users.');
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'mv', authorVc.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const targetMembers: GuildMember[] = [];
    const failures: string[] = [];
    const seenIds = new Set<string>();

    // Replied user is automatically treated as the first argument
    if (replyTarget) {
      targetMembers.push(replyTarget);
      seenIds.add(replyTarget.id);
    }

    if (parsed.args.length > 0) {
      for (const arg of parsed.args) {
        const result = await resolveUser(arg, guild);
        if (!result.success) {
          failures.push(`\`${arg}\`: ${result.error}`);
        } else if (result.value.member) {
          if (!seenIds.has(result.value.member.id)) {
            seenIds.add(result.value.member.id);
            targetMembers.push(result.value.member);
          }
        } else {
          failures.push(`\`${arg}\`: not in this server`);
        }
      }
    }

    if (targetMembers.length === 0) {
      if (failures.length > 0) {
        await respond.error(`Could not resolve target user(s):\n${failures.join('\n')}`);
      } else {
        await respond.error('Please mention at least one user to move, or reply to a user\'s message.');
      }
      return;
    }

    const successes: string[] = [];

    for (const targetMember of targetMembers) {
      if (!targetMember.voice.channel) {
        failures.push(`${mentionUser(targetMember.id)} (not in VC)`);
        continue;
      }

      if (targetMember.voice.channelId === authorVc.id) {
        failures.push(`${mentionUser(targetMember.id)} (already in your channel)`);
        continue;
      }

      try {
        await targetMember.voice.setChannel(authorVc);
        successes.push(mentionUser(targetMember.id));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        consoleLog('error', 'command_failure', `mv: failed to move ${targetMember.id}`, { error: msg });
        failures.push(`${mentionUser(targetMember.id)} (failed)`);
      }
    }

    if (successes.length > 0 && failures.length === 0) {
      await respond.success(`Moved ${successes.join(', ')} to **${authorVc.name}**.`);
    } else if (successes.length > 0 && failures.length > 0) {
      await respond.send(`> Moved ${successes.join(', ')} to **${authorVc.name}**.\n> **Notice:** ${failures.join(', ')}`);
    } else {
      await respond.error(`Could not move target(s): ${failures.join(', ')}`);
    }
  },
});
