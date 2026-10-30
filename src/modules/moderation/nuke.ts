import { PermissionsBitField } from 'discord.js';
import type { TextChannel, NewsChannel, VoiceChannel, StageChannel, ForumChannel, GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { buildNukeConfirmationPayload } from './_nukeHandler.js';

export default defineCommand({
  name: 'nuke',
  aliases: ['clearall', 'recreatechannel', 'nukechannel'],
  module: 'moderation',
  description: 'Nuke current channel by cloning it (retaining permissions and position) and deleting the original.',
  usage: 'nuke',
  examples: ['nuke'],
  ownerOnly: true,
  permissions: [],
  botPermissions: [PermissionsBitField.Flags.ManageChannels],
  cooldown: 10,

  async execute(ctx: CommandContext): Promise<void> {
    const { channel, member, respond } = ctx;

    const targetChannel = channel as TextChannel | NewsChannel | VoiceChannel | StageChannel | ForumChannel;

    if (!targetChannel || typeof targetChannel.clone !== 'function') {
      await respond.error('Nuke can only be executed in valid server channels.');
      return;
    }

    const confirmationPayload = buildNukeConfirmationPayload(targetChannel.id, member.id);
    await (channel as GuildTextBasedChannel).send(confirmationPayload);
  },
});
