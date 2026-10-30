import type { GuildTextBasedChannel } from 'discord.js';
import { defineCommand } from '../../types/command.js';
import type { CommandContext } from '../../types/command.js';
import { measurePing, buildPingV2Embed } from './pingUI.js';

export default defineCommand({
  name: 'ping',
  aliases: ['latency', 'pong'],
  module: 'general',
  description: 'Display real-time WebSocket, database, and roundtrip ping telemetry.',
  usage: 'ping',
  examples: ['ping', 'latency', 'pong'],
  permissions: [],
  botPermissions: [],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { message, channel, member } = ctx;
    const client = message.client;
    const pingData = await measurePing(client, message.createdTimestamp);
    const payload = buildPingV2Embed(pingData, member.id);
    await (channel as GuildTextBasedChannel).send(payload);
  },
});
