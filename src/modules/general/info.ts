import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { getPrefix } from '../../core/database/repositories/guildConfigRepo.js';
import { buildInfoV2Embed } from './infoUI.js';

export default defineCommand({
  name: 'info',
  aliases: ['botinfo', 'about'],
  module: 'general',
  description: 'Display comprehensive bot specs, system stats, and community telemetry.',
  usage: 'info',
  examples: ['info', 'botinfo'],
  permissions: [],
  botPermissions: [],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { message, guild, channel, member } = ctx;
    const client = message.client;
    const prefix = await getPrefix(guild.id);
    const payload = await buildInfoV2Embed(client, guild, prefix, member.id);
    await (channel as GuildTextBasedChannel).send({ components: payload.components, flags: payload.flags as any });
  },
});
