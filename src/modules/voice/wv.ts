import type { GuildMember } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveUser } from '../../core/resolver/UserResolver.js';
import { mentionChannel } from '../../core/utils/formatters.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';

export default defineCommand({
  name: 'wv',
  aliases: ['whichvc'],
  module: 'voice',
  description: 'Displays the voice channel details of the mentioned or replied user.',
  usage: 'wv <user>',
  examples: ['wv @User', 'wv 123456789012345678'],
  permissions: [],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond, replyTarget } = ctx;

    let targetMember: GuildMember | null = null;

    if (parsed.args.length > 0) {
      const result = await resolveUser(parsed.args.join(' '), guild);
      if (!result.success) {
        await respond.error(result.error);
        return;
      }
      if (!result.value.member) {
        await respond.error('That user is not a member of this server.');
        return;
      }
      targetMember = result.value.member;
    } else if (replyTarget) {
      targetMember = replyTarget;
    }

    if (!targetMember) {
      await respond.error('Please mention or reply to a user to check their voice channel.');
      return;
    }

    const voiceState = targetMember.voice;
    if (!voiceState.channel) {
      await respond.error(`**${targetMember.displayName || targetMember.user.username}** is not connected to any voice channel.`);
      return;
    }

    const access = await checkVoiceAccess(guild.id, member, 'wv', voiceState.channel.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const chan = voiceState.channel;
    const count = chan.members.size;
    const limit = 'userLimit' in chan && chan.userLimit && chan.userLimit > 0 ? `${chan.userLimit}` : '∞';

    // Format: <channel mention> ( = ) `current/limit`
    await respond.send(`${mentionChannel(chan.id)} ( = ) \`${count}/${limit}\``);
  },
});
