import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { resolveVoiceChannel } from '../../core/resolver/VoiceChannelResolver.js';
import { checkVoiceAccess } from './vconfigEvaluator.js';
import { ui } from '../../core/ui/index.js';
import { MessageFlags } from 'discord.js';

export default defineCommand({
  name: 'invc',
  module: 'voice',
  description: 'List all members in a voice channel.',
  usage: 'invc [voice-channel]',
  examples: ['invc', 'invc General', 'invc 123456789012345678'],
  permitOnly: true,
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, respond } = ctx;

    let voiceChannel;

    if (parsed.args.length === 0) {
      const authorVc = member.voice.channel;
      if (!authorVc) {
        await respond.error('You are not in a voice channel. Specify a channel or join one first.');
        return;
      }
      voiceChannel = authorVc;
    } else {
      const result = resolveVoiceChannel(parsed.args.join(' '), guild);
      if (!result.success) {
        await respond.error(result.error);
        return;
      }
      voiceChannel = result.value.channel;
    }

    const access = await checkVoiceAccess(guild.id, member, 'invc', voiceChannel.id);
    if (!access.allowed) {
      await respond.denied(access.reason || 'Voice command access denied.');
      return;
    }

    const members = voiceChannel.members;
    const limitNum = 'userLimit' in voiceChannel && voiceChannel.userLimit && voiceChannel.userLimit > 0 ? voiceChannel.userLimit : null;
    const limitStr = limitNum ? `${limitNum}` : '∞';
    const headerText = `**${voiceChannel.name} | \`${members.size}/${limitStr}\`**`;

    const container = ui.container();
    container.addTextDisplayComponents(ui.text(headerText));
    container.addSeparatorComponents(ui.separator(true));

    if (members.size === 0) {
      container.addTextDisplayComponents(ui.text('*This voice channel is currently empty.*'));
    } else {
      const lines: string[] = [];
      for (const m of members.values()) {
        const tags: string[] = [];
        const vs = m.voice;

        if (vs.streaming) tags.push('`LIVE`');
        if (vs.selfVideo) tags.push('`CAM`');
        if (m.user.bot) tags.push('`BOT`');

        const tagSuffix = tags.length > 0 ? ` ${tags.join(' ')}` : '';
        lines.push(`• <@${m.id}>${tagSuffix}`);
      }
      container.addTextDisplayComponents(ui.text(lines.join('\n')));
    }

    await respond.raw({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: {
        parse: [],
        users: [],
        roles: [],
      },
    });
  },
});
