import { PermissionsBitField } from 'discord.js';
import { defineCommand, type CommandContext } from '../../types/command.js';
import {
  getGiveawayByMessageId,
  getGiveawayEntries,
} from '../../core/database/repositories/giveawayRepo.js';

export default defineCommand({
  name: 'greroll',
  aliases: ['giveawayreroll'],
  module: 'giveaway',
  description: 'Pick new random winners from the participants of an ended giveaway.',
  usage: 'greroll <message_id> <amount_of_participants>',
  examples: ['greroll 123456789012345678 1', 'greroll 123456789012345678 2'],
  permissions: [PermissionsBitField.Flags.ManageGuild],
  cooldown: 3,

  async execute(ctx: CommandContext): Promise<void> {
    const { parsed, guild, channel, respond } = ctx;

    if (parsed.args.length < 2) {
      await respond.error(
        `Invalid syntax!\n` +
        `Usage: \`${parsed.prefix}greroll <message_id> <amount_of_participants>\`\n` +
        `Example: \`${parsed.prefix}greroll 123456789012345678 1\``
      );
      return;
    }

    const messageId = parsed.args[0].trim();
    const count = parseInt(parsed.args[1], 10);

    if (isNaN(count) || count < 1 || count > 20) {
      await respond.error('Amount of participants to pick must be a positive integer between 1 and 20.');
      return;
    }

    const ga = await getGiveawayByMessageId(messageId);
    if (!ga || ga.guildId !== guild.id) {
      await respond.error(`Could not find a giveaway with message ID \`${messageId}\` in this server.`);
      return;
    }

    const entries = await getGiveawayEntries(ga.id);
    if (entries.length === 0) {
      await respond.warning('There were no participants in this giveaway to reroll.');
      return;
    }

    const pool = [...entries];
    const pickCount = Math.min(count, pool.length);
    const newWinners: string[] = [];

    for (let i = 0; i < pickCount; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      newWinners.push(pool.splice(idx, 1)[0]);
    }

    const mentions = newWinners.map((id) => `<@${id}>`).join(', ');
    await channel.send({
      content: `🎉 **New Winner(s):** ${mentions}! Congratulations, you won the reroll for **${ga.prize}**!`,
    });

    await respond.success(`Rerolled ${newWinners.length} winner(s) successfully!`);
  },
});

