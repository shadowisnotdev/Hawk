import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import { parseTime, formatTime } from '../../core/utils/parsers.js';
import { resolveRole } from '../../core/resolver/RoleResolver.js';
import { createGiveaway } from '../../core/database/repositories/giveawayRepo.js';
import { buildGiveawayActivePayload } from './_giveawayHandler.js';

export default defineCommand({
  name: 'gstart',
  aliases: ['giveawaystart', 'gcreate'],
  module: 'giveaway',
  description: 'Launch an interactive giveaway matching Discohook layout.',
  usage: 'gstart <time> <amount_of_winners> <prize_text> [required_role]',
  examples: [
    'gstart 10m 1 Discord Nitro',
    'gstart 1h30m 2 Steam Key @VIP',
    'gstart 1d 1 1,000,000 Coins',
  ],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  botPermissions: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks],
  cooldown: 5,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, member, channel, respond } = ctx;

    if (parsed.args.length < 3) {
      await respond.error(
        `Invalid syntax!\n` +
        `Usage: \`${parsed.prefix}gstart <time> <amount_of_winners> <prize_text> [required_role]\`\n` +
        `Example: \`${parsed.prefix}gstart 10m 1 Discord Nitro @VIP\``
      );
      return;
    }

    const durationMs = parseTime(parsed.args[0]);
    if (!durationMs || durationMs < 5_000) {
      await respond.error('Invalid duration. Use compact formats like `10s`, `15m`, `1h30m`, `2d` (minimum 5s).');
      return;
    }

    const winnerCount = parseInt(parsed.args[1], 10);
    if (isNaN(winnerCount) || winnerCount < 1 || winnerCount > 50) {
      await respond.error('Winner count must be a positive integer between 1 and 50.');
      return;
    }

    const remainingArgs = parsed.args.slice(2);
    let requiredRoleId: string | null = null;

    // Check if the last argument is a role mention or name
    if (remainingArgs.length > 1) {
      const lastArg = remainingArgs[remainingArgs.length - 1];
      const roleRes = resolveRole(lastArg, guild);
      if (roleRes.success && roleRes.value.role.id !== guild.id) {
        requiredRoleId = roleRes.value.role.id;
        remainingArgs.pop();
      }
    }

    const prize = remainingArgs.join(' ').trim();
    if (!prize) {
      await respond.error('Please specify a valid prize description for the giveaway.');
      return;
    }

    const endsAt = new Date(Date.now() + durationMs);

    // Initial temporary record
    const tempGa = {
      id: 0,
      messageId: '',
      channelId: channel.id,
      guildId: guild.id,
      hostId: member.id,
      prize,
      winnerCount,
      requiredRoleId,
      endsAt,
      ended: false,
      winners: [],
      createdAt: new Date(),
    };

    const { embed, row } = buildGiveawayActivePayload(tempGa, 0, guild);
    const sentMsg = await channel.send({ embeds: [embed], components: [row] });

    // Persist to DB with messageId
    const record = await createGiveaway({
      messageId: sentMsg.id,
      channelId: channel.id,
      guildId: guild.id,
      hostId: member.id,
      prize,
      winnerCount,
      requiredRoleId,
      endsAt,
    });

    // Update button customId with persisted record ID
    const { embed: updatedEmbed, row: updatedRow } = buildGiveawayActivePayload(record, 0, guild);
    await sentMsg.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});

    await respond.success(`🎉 Giveaway started in ${channel} for **${prize}**! Ends in ${formatTime(durationMs)}.`);
  },
});

